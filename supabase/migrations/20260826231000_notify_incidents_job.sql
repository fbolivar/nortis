-- =============================================================================
-- Nortis | Alertas por correo (2/2): job de envio via pg_net + Resend
-- =============================================================================
-- Un job SQL, hermano de detect_dlp_incidents: recorre los incidentes sin
-- notificar de cada tenant con alertas activas y envia un correo digest via la
-- API de Resend usando pg_net. Coherente con el modelo de Nortis: server-side,
-- privilegiado por SECURITY DEFINER, sin service_role ni URL de sitio en el app.
--
-- CREDENCIALES (las provisiona el operador cuando este listo, en Supabase Vault):
--   - resend_api_key    : API key de Resend.
--   - alerts_from       : remitente verificado, ej. 'Nortis <alertas@dominio.co>'
--   - console_base_url   : base de la consola para el enlace, ej. 'https://app...'
-- Sin resend_api_key o alerts_from, el job NO envia nada y reporta que falta.

-- El cuerpo de la funcion referencia net.http_post (pg_net). En un entorno donde
-- pg_net aun no este disponible (p. ej. el Supabase local del CI), NO debe romper
-- la migracion: se desactiva la validacion del cuerpo y se tolera la ausencia de
-- la extension. En produccion pg_net esta habilitado y el envio funciona.
set check_function_bodies = off;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise warning 'pg_net no disponible: el envio de alertas por correo no funcionara hasta habilitarlo';
end $$;

-- Escapa lo minimo para no romper el HTML del correo con datos del tenant.
create or replace function public.html_escape(p text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(p,''), '&','&amp;'), '<','&lt;'), '>','&gt;');
$$;

create or replace function public.notify_pending_incidents()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text; v_from text; v_base text;
  v_org record; v_ids uuid[]; v_rows text; v_count int; v_total int := 0;
  v_html text; v_subject text;
begin
  select decrypted_secret into v_key  from vault.decrypted_secrets where name = 'resend_api_key';
  if v_key is null or v_key = '' then
    return 'sin credenciales: configure el secreto resend_api_key en Vault';
  end if;
  select decrypted_secret into v_from from vault.decrypted_secrets where name = 'alerts_from';
  if v_from is null or v_from = '' then
    return 'falta el remitente: configure el secreto alerts_from en Vault';
  end if;
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'console_base_url';

  for v_org in
    select s.organization_id, s.recipients, s.min_severity
      from public.alert_settings s
     where s.enabled and array_length(s.recipients, 1) > 0
  loop
    select array_agg(i.id),
           string_agg(
             '<tr>'
             || '<td style="padding:6px 10px;border-bottom:1px solid #eee">' || to_char(i.detected_at at time zone 'UTC','YYYY-MM-DD HH24:MI') || ' UTC</td>'
             || '<td style="padding:6px 10px;border-bottom:1px solid #eee">' || public.html_escape(ep.hostname) || '</td>'
             || '<td style="padding:6px 10px;border-bottom:1px solid #eee">' || public.html_escape(i.rule_triggered) || '</td>'
             || '<td style="padding:6px 10px;border-bottom:1px solid #eee">' || public.html_escape(i.classification) || '</td>'
             || '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-transform:uppercase">' || i.severity || '</td>'
             || '</tr>',
             '' order by i.severity desc, i.detected_at desc
           ),
           count(*)
      into v_ids, v_rows, v_count
      from public.dlp_incidents i
      left join public.endpoints ep on ep.id = i.endpoint_id
     where i.organization_id = v_org.organization_id
       and i.status = 'open'
       and i.notified_at is null
       and i.severity >= v_org.min_severity
       and i.detected_at > now() - interval '2 days';

    if coalesce(v_count, 0) = 0 then
      continue;
    end if;

    v_subject := 'Nortis: ' || v_count || ' incidente(s) de fuga de datos';
    v_html :=
      '<div style="font-family:system-ui,Arial,sans-serif;color:#191919">'
      || '<h2 style="color:#0284c7;margin:0 0 4px">Nortis — alerta de incidentes</h2>'
      || '<p style="margin:0 0 12px;color:#555">Se detectaron ' || v_count || ' incidente(s) que requieren revision.</p>'
      || '<table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr style="text-align:left;color:#555">'
      || '<th style="padding:6px 10px">Detectado</th><th style="padding:6px 10px">Equipo</th>'
      || '<th style="padding:6px 10px">Regla</th><th style="padding:6px 10px">Dato</th><th style="padding:6px 10px">Severidad</th>'
      || '</tr></thead><tbody>' || v_rows || '</tbody></table>'
      || case when coalesce(v_base,'') <> '' then
           '<p style="margin:16px 0 0"><a href="' || v_base || '/incidents" style="background:#0284c7;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none">Abrir la cola de incidentes</a></p>'
         else '' end
      || '<p style="margin:16px 0 0;color:#999;font-size:11px">Recibes esto porque tu correo esta configurado como destinatario de alertas en Nortis.</p>'
      || '</div>';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', v_from, 'to', to_jsonb(v_org.recipients), 'subject', v_subject, 'html', v_html)
    );

    update public.dlp_incidents set notified_at = now() where id = any(v_ids);
    v_total := v_total + v_count;
  end loop;

  return 'notificados ' || v_total || ' incidentes';
end;
$$;

revoke execute on function public.notify_pending_incidents() from public, anon, authenticated;

-- Programacion: 5 min despues de cada corrida de deteccion (que va en */10), para
-- que el incidente ya exista cuando se intenta notificar. Idempotente.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job where jobname = 'nortis-notify-incidents';
    perform cron.schedule('nortis-notify-incidents', '5-59/10 * * * *',
      $job$ select public.notify_pending_incidents(); $job$);
  end if;
end $$;
