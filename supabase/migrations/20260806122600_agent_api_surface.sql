-- =============================================================================
-- Nortis | 26 - Superficie de la API del agente
-- =============================================================================
-- Las funciones que consumen los Route Handlers de /api/agent. Todas
-- SECURITY DEFINER y todas empiezan resolviendo la API key presentada: su
-- autoridad queda acotada al tenant dueño de esa clave.
--
-- POR QUE NO service_role: si el servidor de la aplicacion guardara la clave que
-- salta todo el RLS, un unico fallo en cualquier handler comprometeria a TODOS
-- los clientes a la vez. Aqui, comprometer un handler no da mas de lo que ya da
-- la API key que el atacante tendria que presentar igualmente. Ademas la consola
-- entera funciona sin esa credencial global: no existe, luego no se puede robar.
--
-- POR QUE LA VALIDACION ESTA AQUI Y NO SOLO EN ZOD: estas funciones son
-- alcanzables por PostgREST. Un atacante con una API key valida puede saltarse
-- el Route Handler por completo, asi que los limites que importan —tamaño de
-- lote, tasa, pertenencia del equipo, recorte del titulo de ventana sin
-- consentimiento— tienen que ser invariantes de la base. Zod aporta mejores
-- mensajes y defensa en profundidad, no el control.

-- -----------------------------------------------------------------------------
-- Resolucion de credencial
-- -----------------------------------------------------------------------------
create or replace function public.agent_authenticate(p_api_key text)
returns table (api_key_id uuid, organization_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_hash text;
begin
  if p_api_key is null or p_api_key !~ '^nrt_live_[0-9a-f]{64}$' then
    raise exception 'Credencial invalida' using errcode = '42501';
  end if;

  v_hash := encode(extensions.digest(p_api_key, 'sha256'), 'hex');

  return query
    select k.id, k.organization_id
      from public.api_keys k
     where k.key_hash = v_hash
       and k.revoked_at is null
       and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'Credencial invalida' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Registro / re-registro del equipo
-- -----------------------------------------------------------------------------
-- `#variable_conflict use_column`: `organization_id` es a la vez parametro de
-- salida y columna, y plpgsql no puede decidir en la clausula `on conflict`.
-- Es seguro porque los parametros de salida no se asignan por nombre en ningun
-- punto: el retorno se construye explicitamente al final.
create or replace function public.agent_enroll(
  p_api_key       text,
  p_fingerprint   text,
  p_hostname      text,
  p_os_version    text default null,
  p_agent_version text default null,
  p_user          text default null
)
returns table (endpoint_id uuid, profile_id uuid, organization_id uuid)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_auth  record;
  v_ep_id uuid;
  v_prof  uuid;
begin
  select * into v_auth from public.agent_authenticate(p_api_key);
  perform public.check_agent_rate_limit(v_auth.api_key_id, 0);

  if length(coalesce(p_fingerprint, '')) < 8 or length(coalesce(p_hostname, '')) < 1 then
    raise exception 'Huella de maquina o nombre de equipo invalidos';
  end if;

  -- Perfil por defecto del tenant. Un equipo recien instalado nunca debe quedar
  -- sin ninguna regla esperando a que alguien se acuerde de asignarle una.
  select sp.id into v_prof
    from public.security_profiles sp
   where sp.organization_id = v_auth.organization_id and sp.is_default
   limit 1;

  -- El fingerprint es la identidad: reinstalar el agente actualiza el equipo en
  -- vez de duplicarlo en el inventario (y en la facturacion, que va por equipo).
  insert into public.endpoints as ep (
    organization_id, hostname, machine_fingerprint, os_version, agent_version,
    last_logged_user, status, last_seen_at, assigned_profile_id
  )
  values (
    v_auth.organization_id, p_hostname, p_fingerprint, p_os_version, p_agent_version,
    p_user, 'online'::public.endpoint_status, now(), v_prof
  )
  on conflict (organization_id, machine_fingerprint) do update
    set hostname         = excluded.hostname,
        os_version       = coalesce(excluded.os_version, ep.os_version),
        agent_version    = coalesce(excluded.agent_version, ep.agent_version),
        last_logged_user = coalesce(excluded.last_logged_user, ep.last_logged_user),
        last_seen_at     = now(),
        -- El estado NO se reinicia: si la consola puso el equipo en cuarentena,
        -- reinstalar el agente no puede ser la via para salir de ella.
        status = (case when ep.status = 'quarantined' then 'quarantined' else 'online' end)::public.endpoint_status
  returning ep.id into v_ep_id;

  return query select v_ep_id, v_prof, v_auth.organization_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Ingesta de telemetria por lotes
-- -----------------------------------------------------------------------------
create or replace function public.agent_ingest(
  p_api_key text, p_endpoint_id uuid, p_events jsonb
)
returns table (accepted integer, rejected integer)
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_batch constant integer := 1000;
  v_auth     record;
  v_count    integer;
  v_accepted integer := 0;
  v_consent  boolean;
begin
  select * into v_auth from public.agent_authenticate(p_api_key);

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'Se esperaba un arreglo de eventos';
  end if;

  v_count := jsonb_array_length(p_events);

  -- Tope de lote: sin el, un agente puede enviar un unico JSON de 500 MB y
  -- agotar la memoria del proceso de Postgres.
  if v_count > c_max_batch then
    raise exception 'El lote excede % eventos', c_max_batch using errcode = '22023';
  end if;

  perform public.check_agent_rate_limit(v_auth.api_key_id, v_count);

  -- El equipo DEBE pertenecer al tenant de la clave. Sin esta comprobacion, una
  -- clave valida podria escribir telemetria en el equipo de otro cliente.
  if not exists (
    select 1 from public.endpoints
     where id = p_endpoint_id and organization_id = v_auth.organization_id
  ) then
    raise exception 'El equipo no pertenece a esta organizacion' using errcode = '42501';
  end if;

  select o.monitoring_consent_signed_at is not null into v_consent
    from public.organizations o where o.id = v_auth.organization_id;

  insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
  select
    v_auth.organization_id, p_endpoint_id,
    (e ->> 'event_type')::public.event_type,
    (e ->> 'occurred_at')::timestamptz,
    -- SIN CONSENTIMIENTO FIRMADO SE DESCARTA EL TITULO DE VENTANA aunque el
    -- agente lo mande. La consola no confia en que el agente respete el flag: un
    -- agente viejo, mal configurado o manipulado podria enviarlo igual, y el
    -- titulo de una ventana es dato personal del trabajador (Ley 1581/2012).
    case when v_consent then coalesce(e -> 'payload', '{}'::jsonb)
         else coalesce(e -> 'payload', '{}'::jsonb) - 'title' end
  from jsonb_array_elements(p_events) as e
  where e ? 'event_type'
    and e ? 'occurred_at'
    and jsonb_typeof(coalesce(e -> 'payload', '{}'::jsonb)) = 'object'
    -- Nada del futuro: un reloj adelantado no puede meter eventos en particiones
    -- que aun no existen.
    and (e ->> 'occurred_at')::timestamptz <= now() + interval '5 minutes'
    -- Ni mas viejo que la retencion: su particion pudo ser purgada ya.
    and (e ->> 'occurred_at')::timestamptz >= now() - interval '90 days';

  get diagnostics v_accepted = row_count;

  update public.endpoints
     set last_seen_at = now(),
         status = (case when status = 'quarantined' then 'quarantined' else 'online' end)::public.endpoint_status
   where id = p_endpoint_id;

  return query select v_accepted, v_count - v_accepted;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Descarga de la politica vigente
-- -----------------------------------------------------------------------------
create or replace function public.agent_policy(p_api_key text, p_endpoint_id uuid)
returns table (
  profile_id uuid, profile_name text, schema_version integer,
  config jsonb, updated_at timestamptz, monitoring_allowed boolean
)
language plpgsql security definer set search_path = ''
as $$
declare v_auth record; v_consent boolean;
begin
  select * into v_auth from public.agent_authenticate(p_api_key);
  perform public.check_agent_rate_limit(v_auth.api_key_id, 0);

  if not exists (
    select 1 from public.endpoints
     where id = p_endpoint_id and organization_id = v_auth.organization_id
  ) then
    raise exception 'El equipo no pertenece a esta organizacion' using errcode = '42501';
  end if;

  select o.monitoring_consent_signed_at is not null into v_consent
    from public.organizations o where o.id = v_auth.organization_id;

  update public.endpoints set policy_applied_at = now() where id = p_endpoint_id;

  return query
    select sp.id, sp.name, sp.schema_version,
           -- El servidor RECORTA los modulos invasivos si falta el
           -- consentimiento. El agente ni siquiera recibe la instruccion de
           -- activarlos: es mas robusto que confiar en que la consulte y la
           -- respete.
           case when v_consent then sp.config
                else jsonb_set(sp.config, '{monitoring}',
                       '{"window_titles": false, "screenshots": false}'::jsonb, true)
           end,
           sp.updated_at, v_consent
      from public.endpoints ep
      join public.security_profiles sp on sp.id = ep.assigned_profile_id
     where ep.id = p_endpoint_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Latido
-- -----------------------------------------------------------------------------
create or replace function public.agent_heartbeat(
  p_api_key text, p_endpoint_id uuid,
  p_agent_version text default null, p_user text default null
)
returns table (acknowledged boolean, policy_updated_at timestamptz, quarantined boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_auth record; v_ep record;
begin
  select * into v_auth from public.agent_authenticate(p_api_key);
  perform public.check_agent_rate_limit(v_auth.api_key_id, 0);

  update public.endpoints
     set last_seen_at     = now(),
         agent_version    = coalesce(p_agent_version, agent_version),
         last_logged_user = coalesce(p_user, last_logged_user),
         status = (case when status = 'quarantined' then 'quarantined' else 'online' end)::public.endpoint_status
   where id = p_endpoint_id and organization_id = v_auth.organization_id
  returning * into v_ep;

  if v_ep.id is null then
    raise exception 'El equipo no pertenece a esta organizacion' using errcode = '42501';
  end if;

  -- Se devuelve cuando cambio la politica para que el agente sepa si debe volver
  -- a descargarla, en vez de pedirla entera en cada latido.
  return query
    select true,
           (select sp.updated_at from public.security_profiles sp where sp.id = v_ep.assigned_profile_id),
           v_ep.status = 'quarantined';
end;
$$;

revoke execute on function public.agent_authenticate(text)                   from public, anon, authenticated;
revoke execute on function public.agent_enroll(text,text,text,text,text,text) from public;
revoke execute on function public.agent_ingest(text,uuid,jsonb)               from public;
revoke execute on function public.agent_policy(text,uuid)                     from public;
revoke execute on function public.agent_heartbeat(text,uuid,text,text)        from public;

-- Callables por anon: el agente no tiene sesion de usuario, presenta su API key.
grant execute on function public.agent_enroll(text,text,text,text,text,text) to anon;
grant execute on function public.agent_ingest(text,uuid,jsonb)               to anon;
grant execute on function public.agent_policy(text,uuid)                     to anon;
grant execute on function public.agent_heartbeat(text,uuid,text,text)        to anon;
