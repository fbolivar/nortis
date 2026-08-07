-- =============================================================================
-- Nortis | 19 - Motor de deteccion de incidentes DLP (Modulo 3)
-- =============================================================================
-- Evalua la telemetria contra el perfil ASIGNADO A CADA EQUIPO y abre incidentes.
-- Hasta esta migracion las politicas se podian editar y simular, pero nada las
-- convertia en incidentes: el producto observaba y no acusaba.
--
-- DECISION CENTRAL: UN INCIDENTE POR (equipo, regla, dia), NO POR EVENTO.
--
-- El simulador mostro que un perfil realista genera cientos de violaciones de
-- guardado en dos semanas. Una cola con cientos de filas no se revisa: se
-- ignora. Y una cola ignorada es peor que no tenerla, porque la pagina de
-- cumplimiento afirma que hay supervision cuando en realidad nadie mira. La
-- fatiga de alertas es el modo de fallo mas comun de las herramientas de DLP y
-- se combate en el diseño de los datos, no pidiendole al analista que se
-- esfuerce mas.
--
-- Con grano diario el conteo de cada incidente es inequivoco ("38 guardados
-- fuera de carpeta autorizada en BOG-ADM-01 el 5 de agosto"), y el detalle fino
-- sigue disponible en la linea de tiempo del equipo durante los 90 dias de
-- retencion. El volumen se maneja en la interfaz con filtros y revision masiva.

-- Clave de deduplicacion. Es lo que permite re-ejecutar el motor cada pocos
-- minutos sin duplicar: la segunda pasada del dia actualiza el incidente ya
-- abierto en vez de crear otro.
alter table public.dlp_incidents
  add column if not exists occurrence_day date
    generated always as ((detected_at at time zone 'UTC')::date) stored;

create unique index if not exists dlp_incidents_dedup_idx
  on public.dlp_incidents (organization_id, endpoint_id, rule_triggered, occurrence_day);

comment on index public.dlp_incidents_dedup_idx is
  'Un incidente por equipo, regla y dia. Evita que la cola se vuelva irrevisable y hace idempotente al motor de deteccion.';

-- Severidad por regla. Vive en la base y no en la aplicacion porque el motor
-- corre como job de pg_cron: una tabla de severidades en TypeScript no seria
-- consultable desde ahi.
create or replace function public.dlp_rule_severity(p_rule text)
returns public.incident_severity
language sql
immutable
set search_path = ''
as $$
  select case p_rule
    when 'usb.dispositivo_no_autorizado'          then 'critical'
    when 'clipboard.copia_desde_origen_protegido' then 'high'
    when 'web.webmail_bloqueado'                  then 'high'
    when 'web.dominio_bloqueado'                  then 'high'
    when 'storage.extension_prohibida'            then 'high'
    when 'storage.carpeta_no_autorizada'          then 'medium'
    -- La lista blanca de dominios marca todo lo que no este en ella, asi que
    -- produce mucho ruido legitimo. Entra como baja a proposito: subirla
    -- ahogaria las alertas que si importan.
    when 'web.fuera_de_lista_blanca'              then 'low'
    when 'print.trabajo_intervenido'              then 'low'
    else 'medium'
  end::public.incident_severity;
$$;

-- -----------------------------------------------------------------------------
-- Motor
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER porque debe INSERTAR en dlp_incidents, y ningun rol de
-- consola tiene ese permiso a proposito (los incidentes son evidencia; no los
-- crea un humano). No recibe organization_id: recorre todos los tenants y cada
-- incidente hereda la organizacion del equipo que lo origino, asi que no hay
-- forma de escribir un incidente en el tenant equivocado.
create or replace function public.detect_dlp_incidents(p_days integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
begin
  insert into public.dlp_incidents as di (
    organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
    rule_triggered, rule_channel, severity, status, enforcement_action, detected_at
  )
  select
    d.organization_id,
    d.endpoint_id,
    d.last_event_id,
    d.last_occurred_at,
    jsonb_build_object(
      'occurrences', d.occurrences,
      'sample',      d.sample,
      'user',        d.actor,
      'window',      jsonb_build_object('from', d.first_occurred_at, 'to', d.last_occurred_at)
    ),
    d.rule_key,
    d.channel,
    public.dlp_rule_severity(d.rule_key),
    'open',
    d.action,
    d.last_occurred_at
  from (
    select
      ep.organization_id,
      ep.id                              as endpoint_id,
      r.rule_key,
      r.channel,
      r.action,
      count(*)                           as occurrences,
      min(e.occurred_at)                 as first_occurred_at,
      max(e.occurred_at)                 as last_occurred_at,
      (array_agg(e.id order by e.occurred_at desc))[1]     as last_event_id,
      (array_agg(r.sample order by e.occurred_at desc))[1] as sample,
      (array_agg(e.payload ->> 'user' order by e.occurred_at desc))[1] as actor
    from public.endpoints ep
    join public.security_profiles sp on sp.id = ep.assigned_profile_id
    join public.activity_events e
      on e.endpoint_id = ep.id
     and e.occurred_at >= (now() - make_interval(days => p_days))
    -- Una fila por regla violada. LATERAL para poder leer el config del perfil
    -- de ESE equipo: dos equipos con perfiles distintos evaluan reglas distintas
    -- sobre el mismo tipo de evento.
    cross join lateral (
      select 'storage.carpeta_no_autorizada' as rule_key, 'storage' as channel, 'block' as action,
             e.payload ->> 'path' as sample
       where jsonb_array_length(coalesce(sp.config #> '{storage,allowed_paths}', '[]'::jsonb)) > 0
         and e.event_type in ('file_created', 'file_modified')
         and e.payload ->> 'path' is not null
         and not exists (
           select 1 from jsonb_array_elements_text(sp.config #> '{storage,allowed_paths}') as ap(path)
            where e.payload ->> 'path' like ap.path || '%')

      union all
      select 'storage.extension_prohibida', 'storage', 'block', e.payload ->> 'path'
       where e.event_type in ('file_created', 'file_modified')
         and lower(coalesce(e.payload ->> 'extension', '')) in (
           select lower(value) from jsonb_array_elements_text(coalesce(sp.config #> '{storage,blocked_extensions}', '[]'::jsonb)))

      union all
      select 'usb.dispositivo_no_autorizado', 'usb', coalesce(sp.config #>> '{usb,mode}', 'block'),
             coalesce(e.payload ->> 'serial', e.payload ->> 'label')
       where coalesce(sp.config #>> '{usb,mode}', 'allow') <> 'allow'
         and e.event_type = 'usb_connected'
         and coalesce(e.payload ->> 'serial', '') not in (
           select value from jsonb_array_elements_text(coalesce(sp.config #> '{usb,serial_allowlist}', '[]'::jsonb)))

      union all
      select 'web.dominio_bloqueado', 'web', 'block', e.payload ->> 'domain'
       where e.event_type = 'web_visit'
         and exists (
           select 1 from jsonb_array_elements_text(coalesce(sp.config #> '{web,blocked_domains}', '[]'::jsonb)) as bd(domain)
            where e.payload ->> 'domain' = bd.domain or e.payload ->> 'domain' like '%.' || bd.domain)

      union all
      select 'web.fuera_de_lista_blanca', 'web', 'block', e.payload ->> 'domain'
       where jsonb_array_length(coalesce(sp.config #> '{web,allowed_domains}', '[]'::jsonb)) > 0
         and e.event_type = 'web_visit'
         and not exists (
           select 1 from jsonb_array_elements_text(sp.config #> '{web,allowed_domains}') as ad(domain)
            where e.payload ->> 'domain' = ad.domain or e.payload ->> 'domain' like '%.' || ad.domain)

      union all
      select 'web.webmail_bloqueado', 'web', 'block', e.payload ->> 'domain'
       where coalesce((sp.config #>> '{web,block_webmail}')::boolean, false)
         and e.event_type = 'web_visit'
         and e.payload ->> 'domain' in (
           'mail.google.com','gmail.com','outlook.com','outlook.live.com','hotmail.com',
           'mail.yahoo.com','proton.me','mail.proton.me','zoho.com','mail.com')

      union all
      select 'clipboard.copia_desde_origen_protegido', 'clipboard',
             case when sp.config #>> '{clipboard,mode}' = 'block' then 'block' else 'alert' end,
             e.payload ->> 'source_app'
       where coalesce(sp.config #>> '{clipboard,mode}', 'allow') <> 'allow'
         and e.event_type = 'clipboard_copy'
         and (jsonb_array_length(coalesce(sp.config #> '{clipboard,protected_sources}', '[]'::jsonb)) = 0
              or e.payload ->> 'source_app' in (
                select value from jsonb_array_elements_text(sp.config #> '{clipboard,protected_sources}')))

      union all
      select 'print.trabajo_intervenido', 'print',
             case when sp.config #>> '{printing,mode}' = 'block' then 'block' else 'log' end,
             e.payload ->> 'document'
       where coalesce(sp.config #>> '{printing,mode}', 'allow') <> 'allow'
         and e.event_type = 'print_job'
    ) r
    group by ep.organization_id, ep.id, r.rule_key, r.channel, r.action,
             (e.occurred_at at time zone 'UTC')::date
  ) d
  on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
    -- Solo se refresca mientras el incidente siga abierto. Si un analista ya lo
    -- reviso y lo cerro, reabrirlo por una ocurrencia mas borraria su trabajo y
    -- la cola no vaciaria nunca.
    set event_snapshot = excluded.event_snapshot,
        event_id       = excluded.event_id,
        detected_at    = excluded.detected_at
    where di.status = 'open';

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

revoke execute on function public.detect_dlp_incidents(integer) from public, anon, authenticated;
grant   execute on function public.detect_dlp_incidents(integer) to service_role;

revoke execute on function public.dlp_rule_severity(text) from public, anon;
grant   execute on function public.dlp_rule_severity(text) to authenticated;
