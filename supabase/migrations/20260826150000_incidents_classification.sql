-- =============================================================================
-- Nortis | Incidentes conscientes de la clasificacion (1)
-- =============================================================================
-- La clasificacion deja de ser solo un numero en el panel: ahora el INCIDENTE
-- hereda la clase del dato involucrado y SUBE de severidad si esa clase es
-- sensible. Un archivo "Datos personales" que sale fuera de sitio no es un
-- incidente cualquiera — la cola lo prioriza sola.

-- Que clases se consideran sensibles (escalan la severidad). El admin lo decide;
-- se marcan por defecto las dos que la fase B sembro con patrones de contenido.
alter table public.data_classifications
  add column if not exists sensitive boolean not null default false;

update public.data_classifications
   set sensitive = true
 where lower(name) in ('financiero', 'datos personales');

-- El incidente guarda la clasificacion del dato (nulo si el evento no traia una).
alter table public.dlp_incidents
  add column if not exists classification text;

-- Recreacion de detect_dlp_incidents: identica a la version anterior salvo por
--   (a) agregar la clasificacion mas reciente del grupo,
--   (b) guardarla en el incidente, y
--   (c) escalar la severidad a 'high' si esa clase es sensible (nunca baja una
--       'critical', solo sube lo que estaba por debajo).
create or replace function public.detect_dlp_incidents(p_days integer default 1)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_created integer := 0;
begin
  insert into public.dlp_incidents as di (
    organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
    rule_triggered, rule_channel, severity, status, enforcement_action, detected_at,
    classification)
  select d.organization_id, d.endpoint_id, d.last_event_id, d.last_occurred_at,
    jsonb_build_object('occurrences', d.occurrences, 'sample', d.sample, 'user', d.actor,
      'window', jsonb_build_object('from', d.first_occurred_at, 'to', d.last_occurred_at)),
    d.rule_key, d.channel,
    -- Severidad base de la regla, escalada a 'high' si la clase es sensible.
    case
      when d.classification is not null
       and exists (select 1 from public.data_classifications dc
                    where dc.organization_id = d.organization_id
                      and lower(dc.name) = lower(d.classification) and dc.sensitive)
       and public.dlp_rule_severity(d.rule_key) <> 'critical'::public.incident_severity
      then 'high'::public.incident_severity
      else public.dlp_rule_severity(d.rule_key)
    end,
    'open', d.action, d.last_occurred_at, d.classification
  from (
    select ep.organization_id, ep.id as endpoint_id, r.rule_key, r.channel,
      coalesce((array_agg(e.payload ->> 'enforcement' order by e.occurred_at desc)
                 filter (where e.payload ? 'enforcement'))[1], min(r.action)) as action,
      count(*) as occurrences, min(e.occurred_at) as first_occurred_at, max(e.occurred_at) as last_occurred_at,
      (array_agg(e.id order by e.occurred_at desc))[1] as last_event_id,
      (array_agg(r.sample order by e.occurred_at desc))[1] as sample,
      (array_agg(e.payload ->> 'user' order by e.occurred_at desc))[1] as actor,
      -- Clasificacion mas reciente del grupo (la etiqueta de la fase B).
      (array_agg(e.payload ->> 'classification' order by e.occurred_at desc)
        filter (where e.payload ? 'classification'))[1] as classification
    from public.endpoints ep
    join public.security_profiles sp on sp.id = ep.assigned_profile_id
    join public.activity_events e on e.endpoint_id = ep.id and e.occurred_at >= (now() - make_interval(days => p_days))
    cross join lateral (
      select 'storage.carpeta_no_autorizada' as rule_key, 'storage' as channel, 'block' as action, e.payload ->> 'path' as sample
       where jsonb_array_length(coalesce(sp.config #> '{storage,allowed_paths}', '[]'::jsonb)) > 0
         and e.event_type in ('file_created', 'file_modified') and e.payload ->> 'path' is not null
         and not exists (select 1 from jsonb_array_elements_text(sp.config #> '{storage,allowed_paths}') as ap(path)
            where e.payload ->> 'path' like ap.path || '%')
      union all
      select 'storage.extension_prohibida', 'storage', 'block', e.payload ->> 'path'
       where e.event_type in ('file_created', 'file_modified')
         and lower(coalesce(e.payload ->> 'extension', '')) in (select lower(value) from jsonb_array_elements_text(coalesce(sp.config #> '{storage,blocked_extensions}', '[]'::jsonb)))
      union all
      select 'usb.dispositivo_no_autorizado', 'usb', coalesce(sp.config #>> '{usb,mode}', 'block'), coalesce(e.payload ->> 'serial', e.payload ->> 'label')
       where coalesce(sp.config #>> '{usb,mode}', 'allow') <> 'allow' and e.event_type = 'usb_connected'
         and coalesce(e.payload ->> 'serial', '') not in (select value from jsonb_array_elements_text(coalesce(sp.config #> '{usb,serial_allowlist}', '[]'::jsonb)))
      union all
      select 'web.dominio_bloqueado', 'web', 'block', e.payload ->> 'domain'
       where e.event_type = 'web_visit' and exists (select 1 from jsonb_array_elements_text(coalesce(sp.config #> '{web,blocked_domains}', '[]'::jsonb)) as bd(domain)
            where e.payload ->> 'domain' = bd.domain or e.payload ->> 'domain' like '%.' || bd.domain)
      union all
      select 'web.fuera_de_lista_blanca', 'web', 'block', e.payload ->> 'domain'
       where jsonb_array_length(coalesce(sp.config #> '{web,allowed_domains}', '[]'::jsonb)) > 0 and e.event_type = 'web_visit'
         and not exists (select 1 from jsonb_array_elements_text(sp.config #> '{web,allowed_domains}') as ad(domain)
            where e.payload ->> 'domain' = ad.domain or e.payload ->> 'domain' like '%.' || ad.domain)
      union all
      select 'web.webmail_bloqueado', 'web', 'block', e.payload ->> 'domain'
       where coalesce((sp.config #>> '{web,block_webmail}')::boolean, false) and e.event_type = 'web_visit'
         and e.payload ->> 'domain' in ('mail.google.com','gmail.com','outlook.com','outlook.live.com','hotmail.com','mail.yahoo.com','proton.me','mail.proton.me','zoho.com','mail.com')
      union all
      select 'clipboard.copia_desde_origen_protegido', 'clipboard',
             case when sp.config #>> '{clipboard,mode}' = 'block' then 'block' else 'alert' end, e.payload ->> 'source_app'
       where coalesce(sp.config #>> '{clipboard,mode}', 'allow') <> 'allow' and e.event_type = 'clipboard_copy'
         and (jsonb_array_length(coalesce(sp.config #> '{clipboard,protected_sources}', '[]'::jsonb)) = 0
              or e.payload ->> 'source_app' in (select value from jsonb_array_elements_text(sp.config #> '{clipboard,protected_sources}')))
      union all
      select 'print.trabajo_intervenido', 'print',
             case when sp.config #>> '{printing,mode}' = 'block' then 'block' else 'log' end, e.payload ->> 'document'
       where coalesce(sp.config #>> '{printing,mode}', 'allow') <> 'allow' and e.event_type = 'print_job'
    ) r
    group by ep.organization_id, ep.id, r.rule_key, r.channel, (e.occurred_at at time zone 'UTC')::date
  ) d
  on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
    set event_snapshot = excluded.event_snapshot, event_id = excluded.event_id,
        detected_at = excluded.detected_at,
        classification = excluded.classification, severity = excluded.severity
    where di.status = 'open';
  get diagnostics v_created = row_count;
  return v_created;
end; $$;
