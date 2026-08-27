-- Alertas a Slack (o cualquier webhook https), canal independiente del correo.
alter table public.alert_settings add column if not exists slack_webhook_url text;
alter table public.dlp_incidents add column if not exists slack_notified_at timestamptz;

drop function if exists public.set_alert_settings(boolean, text[], public.incident_severity);
create or replace function public.set_alert_settings(
  p_enabled boolean, p_recipients text[], p_min_severity public.incident_severity,
  p_slack_webhook_url text default null)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_org uuid := (select public.current_org_id());
        v_clean text[]; v_mail text; v_slack text;
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'solo un administrador puede cambiar las alertas';
  end if;
  v_clean := array(select distinct lower(trim(x)) from unnest(coalesce(p_recipients, '{}')) as x where trim(x) <> '');
  if array_length(v_clean, 1) > 20 then raise exception 'demasiados destinatarios (maximo 20)'; end if;
  foreach v_mail in array v_clean loop
    if v_mail !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'correo no valido: %', v_mail; end if;
  end loop;
  v_slack := nullif(trim(coalesce(p_slack_webhook_url, '')), '');
  if v_slack is not null and v_slack !~ '^https://' then raise exception 'el webhook de Slack debe ser una URL https'; end if;
  insert into public.alert_settings as s (organization_id, enabled, recipients, min_severity, slack_webhook_url, updated_at)
  values (v_org, coalesce(p_enabled, false), v_clean, coalesce(p_min_severity, 'high'), v_slack, now())
  on conflict (organization_id) do update
    set enabled = excluded.enabled, recipients = excluded.recipients,
        min_severity = excluded.min_severity, slack_webhook_url = excluded.slack_webhook_url, updated_at = now();
end;
$function$;

create or replace function public.notify_slack_incidents()
returns text language plpgsql security definer set search_path to '' as $function$
declare v_org record; v_ids uuid[]; v_lines text; v_count int; v_total int := 0; v_payload jsonb;
begin
  for v_org in
    select s.organization_id, s.slack_webhook_url, s.min_severity from public.alert_settings s
     where s.enabled and coalesce(s.slack_webhook_url, '') <> ''
  loop
    select array_agg(i.id),
           string_agg('• *' || upper(i.severity::text) || '*  '
             || replace(replace(replace(coalesce(ep.hostname,'—'),'&','&amp;'),'<','&lt;'),'>','&gt;')
             || ' — ' || replace(replace(replace(i.rule_triggered,'&','&amp;'),'<','&lt;'),'>','&gt;')
             || '  (' || to_char(i.detected_at at time zone 'UTC','YYYY-MM-DD HH24:MI') || ' UTC)',
             E'\n' order by i.severity desc, i.detected_at desc), count(*)
      into v_ids, v_lines, v_count
      from public.dlp_incidents i left join public.endpoints ep on ep.id = i.endpoint_id
     where i.organization_id = v_org.organization_id and i.status = 'open' and i.slack_notified_at is null
       and i.severity >= v_org.min_severity and i.detected_at > now() - interval '2 days';
    if coalesce(v_count, 0) = 0 then continue; end if;
    v_payload := jsonb_build_object('text', ':rotating_light: *Nortis — ' || v_count || ' incidente(s) de seguridad*' || E'\n' || v_lines);
    perform net.http_post(url := v_org.slack_webhook_url, headers := jsonb_build_object('Content-Type', 'application/json'), body := v_payload);
    update public.dlp_incidents set slack_notified_at = now() where id = any(v_ids);
    v_total := v_total + v_count;
  end loop;
  return 'slack: notificados ' || v_total || ' incidentes';
end;
$function$;

-- select cron.schedule('nortis-notify-slack', '7-59/10 * * * *', 'select public.notify_slack_incidents();');
