-- =============================================================================
-- Nortis | 14 - Credencial por equipo e ingesta idempotente
-- =============================================================================
-- Cierra los dos huecos que bloquean el desarrollo del agente. Ambos son de la
-- consola, no del agente: ningun cliente puede resolverlos por su cuenta.
--
-- HUECO 1 — LA CREDENCIAL ERA DEL TENANT, NO DEL EQUIPO
--
-- `agent_authenticate` resolvia la API key a una organizacion, y el resto de
-- funciones solo comprobaban que el `p_endpoint_id` perteneciera a ella. La
-- consecuencia era que la MISMA clave tenia que vivir en cada portatil de la
-- flota, y quien extrajera la de un solo equipo podia inyectar o falsear
-- telemetria de CUALQUIER otro equipo del tenant, y enrolar equipos nuevos.
--
-- En un producto cuyo valor es servir de evidencia, poder fabricar evidencia
-- ajena desde el portatil mas descuidado no es un detalle: invalida el producto
-- entero como prueba. Si cualquiera de doscientos equipos pudo escribir el
-- registro de otro, ningun registro prueba nada.
--
-- Ahora la API key del tenant sirve UNICAMENTE para el alta. `agent_enroll`
-- devuelve una credencial propia del equipo (`nrt_ep_…`) y las otras tres
-- funciones exigen esa. El instalador puede borrar la clave del tenant del disco
-- en cuanto termina el enrolamiento, y perder un portatil ya no obliga a rotar
-- la credencial de toda la flota: se revoca ese equipo y ya.
--
-- HUECO 2 — LA INGESTA NO ERA IDEMPOTENTE
--
-- `agent_ingest` hacia un INSERT sin `on conflict` y sin identificador de evento
-- del cliente. Si el agente enviaba un lote, el servidor lo confirmaba y la
-- respuesta se perdia —timeout, corte, cambio de red—, el reintento insertaba
-- todo otra vez: eventos duplicados, conteos inflados e incidentes DLP
-- repetidos. Con portatiles y conectividad intermitente ese es el caso normal,
-- no el raro.
--
-- Ahora cada evento lleva `client_event_id` que genera el agente UNA vez y
-- conserva entre reintentos. Un duplicado se ignora y se cuenta como aceptado,
-- para que el agente pueda purgar su cola: si se le devolviera como rechazado,
-- lo reintentaria para siempre.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Limite de tasa: de por clave a por sujeto
-- -----------------------------------------------------------------------------
-- La tabla anterior tenia clave foranea a api_keys, lo que impedia contabilizar
-- por equipo. Se recrea con un `subject_id` generico —una API key durante el
-- alta, un equipo despues— y SIN clave foranea, porque no puede apuntar a dos
-- tablas a la vez. Las filas huerfanas no importan: `prune_agent_rate_limits`
-- borra todo lo anterior a dos horas.
--
-- El cambio arregla ademas un defecto real del diseño anterior: el presupuesto
-- era de 600 req/min para TODA la flota del tenant, asi que un solo agente en
-- bucle dejaba sin ingesta a los otros ciento noventa y nueve equipos. Ahora
-- cada equipo tiene el suyo y solo se perjudica a si mismo.
--
-- Se puede borrar y recrear sin perdida: solo contiene contadores efimeros.
drop table if exists public.agent_rate_limits;

create table public.agent_rate_limits (
  subject_id    uuid not null,
  window_start  timestamptz not null,
  request_count integer not null default 0,
  event_count   integer not null default 0,
  primary key (subject_id, window_start)
);

alter table public.agent_rate_limits enable row level security;
revoke all on public.agent_rate_limits from anon, authenticated;

create index agent_rate_limits_window_idx on public.agent_rate_limits (window_start);

drop function if exists public.check_agent_rate_limit(uuid, integer);

create or replace function public.check_agent_rate_limit(
  p_subject_id   uuid,
  p_events       integer default 0,
  p_max_requests integer default 120,
  p_max_events   integer default 5000
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_requests integer;
  v_events   integer;
begin
  insert into public.agent_rate_limits (subject_id, window_start, request_count, event_count)
  values (p_subject_id, v_window, 1, p_events)
  on conflict (subject_id, window_start) do update
    set request_count = public.agent_rate_limits.request_count + 1,
        event_count   = public.agent_rate_limits.event_count + p_events
  returning request_count, event_count into v_requests, v_events;

  if v_requests > p_max_requests or v_events > p_max_events then
    raise exception 'Limite de tasa excedido' using errcode = '53400';
  end if;
end;
$$;

comment on function public.check_agent_rate_limit(uuid, integer, integer, integer) is
  'Ventana fija por minuto y sujeto. El sujeto es la API key durante el alta y el equipo despues, para que un agente en bucle no consuma el cupo de toda la flota.';

revoke execute on function public.check_agent_rate_limit(uuid, integer, integer, integer)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Credencial propia de cada equipo
-- -----------------------------------------------------------------------------
alter table public.endpoints
  add column if not exists agent_credential_hash text,
  add column if not exists agent_credential_issued_at timestamptz,
  -- Con que clave se dio de alta. Es trazabilidad: si una API key se filtra, hay
  -- que saber que equipos entraron con ella. ON DELETE SET NULL para que revocar
  -- y borrar la clave no arrastre el inventario.
  add column if not exists enrolled_with_api_key_id uuid
    references public.api_keys(id) on delete set null;

comment on column public.endpoints.agent_credential_hash is
  'SHA-256 de la credencial del equipo. El texto plano se devuelve una sola vez, al enrolar.';

-- Indice de resolucion de credencial. Unico: dos equipos no pueden compartirla.
create unique index if not exists endpoints_agent_credential_idx
  on public.endpoints (agent_credential_hash)
  where agent_credential_hash is not null;

-- -----------------------------------------------------------------------------
-- Idempotencia de la ingesta
-- -----------------------------------------------------------------------------
alter table public.activity_events
  add column if not exists client_event_id uuid;

comment on column public.activity_events.client_event_id is
  'Identificador que genera el agente una vez por evento y conserva entre reintentos. Es lo que hace idempotente la ingesta.';

-- El indice DEBE incluir occurred_at: es la clave de particion, y Postgres exige
-- que todo indice unico de una tabla particionada la contenga. No es una
-- concesion — el agente conserva `occurred_at` intacto entre reintentos, asi que
-- la terna sigue identificando el mismo evento.
--
-- No hace falta que sea parcial: en un indice unico los NULL son distintos entre
-- si, de modo que los eventos sin `client_event_id` (los sembrados por
-- demo_telemetry.sql) conviven sin colisionar.
create unique index if not exists activity_events_client_dedupe_idx
  on public.activity_events (endpoint_id, client_event_id, occurred_at);

-- -----------------------------------------------------------------------------
-- Resolucion de la credencial de equipo
-- -----------------------------------------------------------------------------
create or replace function public.agent_authenticate_endpoint(p_credential text)
returns table (endpoint_id uuid, organization_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_hash text;
begin
  -- Prefijo propio: una credencial de equipo NO es una API key de tenant y no
  -- debe poder usarse en su lugar ni al reves.
  if p_credential is null or p_credential !~ '^nrt_ep_[0-9a-f]{64}$' then
    raise exception 'Credencial invalida' using errcode = '42501';
  end if;

  v_hash := encode(extensions.digest(p_credential, 'sha256'), 'hex');

  return query
    select ep.id, ep.organization_id
      from public.endpoints ep
     where ep.agent_credential_hash = v_hash;

  if not found then
    raise exception 'Credencial invalida' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.agent_authenticate_endpoint(text) from public, anon, authenticated;

-- =============================================================================
-- Las cuatro funciones se recrean desde cero
-- =============================================================================
-- DROP y no CREATE OR REPLACE por dos motivos: cambian el tipo de retorno y el
-- nombre de los parametros, y ninguna de las dos cosas se puede alterar en
-- sitio. Pero sobre todo porque dejar la version anterior viva mantendria
-- alcanzable por PostgREST justo la vulnerabilidad que este archivo cierra.
drop function if exists public.agent_enroll(text, text, text, text, text, text);
drop function if exists public.agent_ingest(text, uuid, jsonb);
drop function if exists public.agent_policy(text, uuid);
drop function if exists public.agent_heartbeat(text, uuid, text, text);

-- -----------------------------------------------------------------------------
-- 1. Alta del equipo — unica funcion que sigue aceptando la API key del tenant
-- -----------------------------------------------------------------------------
create function public.agent_enroll(
  p_api_key       text,
  p_fingerprint   text,
  p_hostname      text,
  p_os_version    text default null,
  p_agent_version text default null,
  p_user          text default null
)
returns table (
  endpoint_id uuid, profile_id uuid, organization_id uuid, agent_credential text
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_auth  record;
  v_ep_id uuid;
  v_prof  uuid;
  v_cred  text := 'nrt_ep_' || encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into v_auth from public.agent_authenticate(p_api_key);

  -- El alta se contabiliza contra la API key con el presupuesto antiguo: enrolar
  -- es raro, pero una clave filtrada no debe poder dar de alta mil equipos.
  perform public.check_agent_rate_limit(v_auth.api_key_id, 0, 600, 50000);

  if length(coalesce(p_fingerprint, '')) < 8 or length(coalesce(p_hostname, '')) < 1 then
    raise exception 'Huella de maquina o nombre de equipo invalidos';
  end if;

  select sp.id into v_prof
    from public.security_profiles sp
   where sp.organization_id = v_auth.organization_id and sp.is_default
   limit 1;

  insert into public.endpoints as ep (
    organization_id, hostname, machine_fingerprint, os_version, agent_version,
    last_logged_user, status, last_seen_at, assigned_profile_id,
    agent_credential_hash, agent_credential_issued_at, enrolled_with_api_key_id
  )
  values (
    v_auth.organization_id, p_hostname, p_fingerprint, p_os_version, p_agent_version,
    p_user, 'online'::public.endpoint_status, now(), v_prof,
    encode(extensions.digest(v_cred, 'sha256'), 'hex'), now(), v_auth.api_key_id
  )
  on conflict (organization_id, machine_fingerprint) do update
    set hostname         = excluded.hostname,
        os_version       = coalesce(excluded.os_version, ep.os_version),
        agent_version    = coalesce(excluded.agent_version, ep.agent_version),
        last_logged_user = coalesce(excluded.last_logged_user, ep.last_logged_user),
        last_seen_at     = now(),
        -- Reinstalar ROTA la credencial. Es deliberado: si el equipo se reinstala
        -- porque estaba comprometido, la credencial anterior debe morir ahi.
        agent_credential_hash      = excluded.agent_credential_hash,
        agent_credential_issued_at = now(),
        enrolled_with_api_key_id   = excluded.enrolled_with_api_key_id,
        status = (case when ep.status = 'quarantined' then 'quarantined' else 'online' end)::public.endpoint_status
  returning ep.id into v_ep_id;

  -- Unica vez que la credencial existe en claro. No se guarda: en la tabla solo
  -- queda su hash, igual que las API keys.
  return query select v_ep_id, v_prof, v_auth.organization_id, v_cred;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Ingesta idempotente
-- -----------------------------------------------------------------------------
create function public.agent_ingest(
  p_credential text, p_endpoint_id uuid, p_events jsonb
)
returns table (accepted integer, rejected integer, duplicates integer)
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_batch constant integer := 1000;
  v_auth       record;
  v_count      integer;
  v_candidates integer := 0;
  v_inserted   integer := 0;
  v_consent    boolean;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);

  -- La credencial YA identifica al equipo. Se sigue exigiendo `p_endpoint_id`
  -- por estabilidad del contrato, pero tiene que coincidir: es lo que impide
  -- escribir telemetria en nombre de otro equipo, que era el hueco anterior.
  if p_endpoint_id is distinct from v_auth.endpoint_id then
    raise exception 'La credencial no corresponde a ese equipo' using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'Se esperaba un arreglo de eventos';
  end if;

  v_count := jsonb_array_length(p_events);

  if v_count > c_max_batch then
    raise exception 'El lote excede % eventos', c_max_batch using errcode = '22023';
  end if;

  perform public.check_agent_rate_limit(v_auth.endpoint_id, v_count);

  select o.monitoring_consent_signed_at is not null into v_consent
    from public.organizations o where o.id = v_auth.organization_id;

  -- `materialized` a proposito: `filtrados` se recorre dos veces —una para
  -- insertar y otra para contar— y sin esto el planificador podria evaluar
  -- jsonb_array_elements dos veces y descuadrar los conteos.
  with filtrados as materialized (
    select
      (e ->> 'event_type')::public.event_type as event_type,
      (e ->> 'occurred_at')::timestamptz      as occurred_at,
      (e ->> 'client_event_id')::uuid         as client_event_id,
      case when v_consent then coalesce(e -> 'payload', '{}'::jsonb)
           else coalesce(e -> 'payload', '{}'::jsonb) - 'title' end as payload
    from jsonb_array_elements(p_events) as e
    where e ? 'event_type'
      and e ? 'occurred_at'
      and jsonb_typeof(coalesce(e -> 'payload', '{}'::jsonb)) = 'object'
      -- El identificador de deduplicacion se valida ANTES de castear: un texto
      -- que no sea UUID abortaria el lote entero en vez de descartar su evento.
      and (
        not (e ? 'client_event_id')
        or (e ->> 'client_event_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      and (e ->> 'occurred_at')::timestamptz <= now() + interval '5 minutes'
      and (e ->> 'occurred_at')::timestamptz >= now() - interval '90 days'
  ),
  insertados as (
    insert into public.activity_events (
      organization_id, endpoint_id, event_type, occurred_at, payload, client_event_id
    )
    select v_auth.organization_id, p_endpoint_id, f.event_type, f.occurred_at, f.payload, f.client_event_id
      from filtrados f
    on conflict (endpoint_id, client_event_id, occurred_at) do nothing
    returning 1
  )
  select (select count(*) from filtrados)::integer,
         (select count(*) from insertados)::integer
    into v_candidates, v_inserted;

  update public.endpoints
     set last_seen_at = now(),
         status = (case when status = 'quarantined' then 'quarantined' else 'online' end)::public.endpoint_status
   where id = p_endpoint_id;

  -- Un duplicado cuenta como ACEPTADO. El agente usa `accepted` para purgar su
  -- cola; devolverselo como rechazado lo dejaria reintentando el mismo evento
  -- indefinidamente, que es justo el bucle que esta funcion viene a cerrar.
  -- `duplicates` se informa aparte porque un numero alto y sostenido significa
  -- que el agente no esta purgando bien, y eso hay que poder verlo.
  return query select v_candidates, v_count - v_candidates, v_candidates - v_inserted;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Politica
-- -----------------------------------------------------------------------------
create function public.agent_policy(p_credential text, p_endpoint_id uuid)
returns table (
  profile_id uuid, profile_name text, schema_version integer,
  config jsonb, updated_at timestamptz, monitoring_allowed boolean
)
language plpgsql security definer set search_path = ''
as $$
declare v_auth record; v_consent boolean;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);

  if p_endpoint_id is distinct from v_auth.endpoint_id then
    raise exception 'La credencial no corresponde a ese equipo' using errcode = '42501';
  end if;

  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  select o.monitoring_consent_signed_at is not null into v_consent
    from public.organizations o where o.id = v_auth.organization_id;

  update public.endpoints set policy_applied_at = now() where id = p_endpoint_id;

  return query
    select sp.id, sp.name, sp.schema_version,
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
create function public.agent_heartbeat(
  p_credential text, p_endpoint_id uuid,
  p_agent_version text default null, p_user text default null
)
returns table (acknowledged boolean, policy_updated_at timestamptz, quarantined boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_auth record; v_ep record;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);

  if p_endpoint_id is distinct from v_auth.endpoint_id then
    raise exception 'La credencial no corresponde a ese equipo' using errcode = '42501';
  end if;

  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  update public.endpoints
     set last_seen_at     = now(),
         agent_version    = coalesce(p_agent_version, agent_version),
         last_logged_user = coalesce(p_user, last_logged_user),
         status = (case when status = 'quarantined' then 'quarantined' else 'online' end)::public.endpoint_status
   where id = p_endpoint_id
  returning * into v_ep;

  return query
    select true,
           (select sp.updated_at from public.security_profiles sp where sp.id = v_ep.assigned_profile_id),
           v_ep.status = 'quarantined';
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke execute on function public.agent_enroll(text,text,text,text,text,text) from public;
revoke execute on function public.agent_ingest(text,uuid,jsonb)               from public;
revoke execute on function public.agent_policy(text,uuid)                     from public;
revoke execute on function public.agent_heartbeat(text,uuid,text,text)        from public;

-- Callables por anon: el agente no tiene sesion de usuario, presenta su
-- credencial. La autoridad la da la credencial, no el rol.
grant execute on function public.agent_enroll(text,text,text,text,text,text) to anon;
grant execute on function public.agent_ingest(text,uuid,jsonb)               to anon;
grant execute on function public.agent_policy(text,uuid)                     to anon;
grant execute on function public.agent_heartbeat(text,uuid,text,text)        to anon;

-- -----------------------------------------------------------------------------
-- El hash de la credencial no se expone a la consola
-- -----------------------------------------------------------------------------
-- Misma regla que `api_keys.key_hash` e `invitations.token_hash`: el material
-- criptografico no llega a la interfaz. `endpoints` tenia SELECT de tabla
-- completa, lo que habria entregado a cualquier miembro del tenant los hashes de
-- todas las credenciales de sus equipos — justo lo que un atacante se lleva para
-- crackear sin prisa y offline.
--
-- CONSECUENCIA QUE HAY QUE RECORDAR: a partir de aqui un `select('*')` sobre
-- endpoints falla la consulta ENTERA con un error de permisos que NO nombra la
-- columna culpable. Por eso existe `ENDPOINT_COLUMNS` en
-- src/shared/types/database.ts: es la lista canonica, y añadir una columna
-- legible es un solo cambio en dos sitios (aqui y alli).
--
-- UPDATE y DELETE siguen a nivel de tabla: la consola reasigna perfiles y da de
-- baja equipos, y ninguna de esas operaciones toca la credencial.
revoke select on public.endpoints from authenticated;

grant select (
  id, organization_id, hostname, machine_fingerprint, os_version, agent_version,
  last_logged_user, status, last_seen_at, assigned_profile_id, policy_applied_at,
  enrolled_at, created_at, updated_at, enrolled_with_api_key_id,
  agent_credential_issued_at
) on public.endpoints to authenticated;
