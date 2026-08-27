-- Exfiltracion por volumen: rafaga de escrituras a unidad externa (letra != C:)
-- en una ventana corta. Programada en pg_cron cada 5 min. Regla:
--   exfil.copia_a_externo (alta, canal 'storage')
create or replace function public.detect_exfil_volume(p_minutes int default 15, p_threshold int default 30)
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_created int := 0;
begin
  insert into public.dlp_incidents as di
    (organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
     rule_triggered, rule_channel, severity, status, enforcement_action, detected_at)
  select d.organization_id, d.endpoint_id, d.last_event_id, d.last_occurred_at,
    jsonb_build_object(
      'occurrences', d.cnt,
      'sample', d.cnt || ' archivos escritos a unidad externa en ' || p_minutes || ' min',
      'user', d.actor,
      'window', jsonb_build_object('from', d.first_occurred_at, 'to', d.last_occurred_at)),
    'exfil.copia_a_externo', 'storage', 'high'::public.incident_severity, 'open', 'alert', d.last_occurred_at
  from (
    select ep.organization_id, ep.id as endpoint_id,
      count(*) as cnt,
      min(e.occurred_at) as first_occurred_at, max(e.occurred_at) as last_occurred_at,
      (array_agg(e.id order by e.occurred_at desc))[1] as last_event_id,
      (array_agg(e.payload ->> 'user' order by e.occurred_at desc))[1] as actor
    from public.endpoints ep
    join public.activity_events e
      on e.endpoint_id = ep.id and e.occurred_at >= now() - make_interval(mins => p_minutes)
    where e.event_type in ('file_created', 'file_modified')
      and e.payload ->> 'path' is not null
      and upper(left(e.payload ->> 'path', 1)) between 'D' and 'Z'
      and substr(e.payload ->> 'path', 2, 1) = ':'
    group by ep.organization_id, ep.id, (e.occurred_at at time zone 'UTC')::date
    having count(*) >= p_threshold
  ) d
  on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
    set event_snapshot = excluded.event_snapshot, event_id = excluded.event_id,
        detected_at = excluded.detected_at
    where di.status = 'open';
  get diagnostics v_created = row_count;
  return v_created;
end; $function$;

-- select cron.schedule('nortis-detect-exfil', '2-59/5 * * * *', 'select public.detect_exfil_volume();');
