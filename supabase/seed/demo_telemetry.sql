-- =============================================================================
-- Nortis | Seed de telemetria de demostracion
-- =============================================================================
-- Puebla una organizacion EXISTENTE con equipos, telemetria e incidentes
-- realistas, para poder construir e iterar los reportes del Modulo 1 sin
-- depender de que el agente Go este terminado.
--
-- Uso:
--   1. Registre su organizacion normalmente desde la consola.
--   2. Ejecute este archivo (SQL Editor de Supabase, o `supabase db execute`).
--
-- Si hay mas de una organizacion, indique cual antes de ejecutarlo:
--   select set_config('nortis.seed_org_slug', 'mi-organizacion', false);
--
-- NO ES UNA MIGRACION. Vive fuera de supabase/migrations a proposito: jamas debe
-- aplicarse a produccion. Es idempotente por equipo (upsert sobre el fingerprint)
-- pero vuelve a generar eventos en cada ejecucion.
-- =============================================================================

do $seed$
declare
  v_org_id      uuid;
  v_slug        text := nullif(current_setting('nortis.seed_org_slug', true), '');
  v_profile_ofi uuid;
  v_profile_cam uuid;
  v_endpoint    record;
  v_day         date;
  v_events      integer := 0;

  -- Catalogo con la forma que produce el agente real (ver
  -- src/shared/schemas/telemetry.ts).
  c_apps        text[] := array['chrome.exe','EXCEL.EXE','WINWORD.EXE','Teams.exe','outlook.exe','sap.exe','notepad++.exe','AcroRd32.exe'];
  c_categories  text[] := array['navegador','ofimatica','ofimatica','comunicacion','correo','erp','desarrollo','documentos'];
  c_domains     text[] := array['drive.google.com','wetransfer.com','mail.google.com','linkedin.com','portal.sap.com','dian.gov.co','bancolombia.com','wa.me'];
  c_users       text[] := array['jperez','mrestrepo','clopez','agomez','dtorres'];
  -- Sin barra final: se añade una sola al concatenar el nombre de archivo. La
  -- raiz del volumen extraible se escribe 'E:' por el mismo motivo — con 'E:\'
  -- salia 'E:\\archivo.xlsx' y una ruta mal formada en un reporte forense hace
  -- dudar de todo el resto del reporte.
  c_folders     text[] := array['C:\Users\%s\Documents\Nomina','C:\Users\%s\Desktop','D:\Compartido\Contabilidad','C:\Users\%s\Downloads','E:'];
  c_files       text[] := array['nomina_agosto.xlsx','contrato_proveedor.docx','cartera_clientes.xlsx','balance_2026.pdf','listado_precios.csv'];
begin
  -- ---------------------------------------------------------------------------
  -- Organizacion destino
  -- ---------------------------------------------------------------------------
  if v_slug is not null then
    select id into v_org_id from public.organizations where slug = v_slug;
    if v_org_id is null then
      raise exception 'No existe una organizacion con slug %', v_slug;
    end if;
  else
    select id into v_org_id from public.organizations
     order by created_at limit 1;
    if v_org_id is null then
      raise exception 'No hay ninguna organizacion. Registre una desde la consola primero.';
    end if;
    if (select count(*) from public.organizations) > 1 then
      raise exception 'Hay varias organizaciones. Indique cual: select set_config(''nortis.seed_org_slug'', ''<slug>'', false);';
    end if;
  end if;

  raise notice 'Sembrando datos en la organizacion %', v_org_id;

  -- ---------------------------------------------------------------------------
  -- Perfiles de seguridad
  -- ---------------------------------------------------------------------------
  -- Ninguno activa titulos de ventana ni captura de pantalla: el trigger de
  -- consentimiento rechazaria el insert si la organizacion no tiene la
  -- autorizacion firmada, y el seed debe funcionar en cualquier caso.
  insert into public.security_profiles (organization_id, name, description, is_default, config)
  values (
    v_org_id, 'Oficina Bogota', 'Personal administrativo en sede principal', true,
    jsonb_build_object(
      'storage',    jsonb_build_object('allowed_paths', jsonb_build_array('D:\Compartido'), 'blocked_extensions', jsonb_build_array('.exe','.bat')),
      'usb',        jsonb_build_object('mode', 'read_only', 'serial_allowlist', jsonb_build_array()),
      'web',        jsonb_build_object('blocked_domains', jsonb_build_array('wetransfer.com'), 'block_webmail', true),
      'clipboard',  jsonb_build_object('mode', 'alert'),
      'printing',   jsonb_build_object('mode', 'log'),
      'monitoring', jsonb_build_object('window_titles', false, 'screenshots', false)
    )
  )
  on conflict (organization_id, lower(name)) do update set description = excluded.description
  returning id into v_profile_ofi;

  insert into public.security_profiles (organization_id, name, description, is_default, config)
  values (
    v_org_id, 'Comercial en campo', 'Portatiles fuera de la red corporativa', false,
    jsonb_build_object(
      'storage',    jsonb_build_object('allowed_paths', jsonb_build_array(), 'blocked_extensions', jsonb_build_array()),
      'usb',        jsonb_build_object('mode', 'block', 'serial_allowlist', jsonb_build_array()),
      'web',        jsonb_build_object('blocked_domains', jsonb_build_array('wetransfer.com','wa.me'), 'block_webmail', true),
      'clipboard',  jsonb_build_object('mode', 'block'),
      'printing',   jsonb_build_object('mode', 'block'),
      'monitoring', jsonb_build_object('window_titles', false, 'screenshots', false)
    )
  )
  on conflict (organization_id, lower(name)) do update set description = excluded.description
  returning id into v_profile_cam;

  -- ---------------------------------------------------------------------------
  -- Equipos
  -- ---------------------------------------------------------------------------
  -- Deliberadamente heterogeneos: uno sin perfil (aparece como brecha de
  -- cobertura), uno en cuarentena y uno sin señal hace dias. Un seed donde todo
  -- esta bien no sirve para diseñar la interfaz — los estados degradados son
  -- justamente los que el analista necesita ver.
  insert into public.endpoints (
    organization_id, hostname, machine_fingerprint, os_version, agent_version,
    last_logged_user, status, last_seen_at, assigned_profile_id, policy_applied_at
  )
  values
    (v_org_id, 'BOG-ADM-01',  'fp-demo-bog-adm-01',  'Windows 11 Pro 24H2', '1.0.0', 'mrestrepo', 'online',      now() - interval '2 minutes',  v_profile_ofi, now() - interval '2 days'),
    (v_org_id, 'BOG-ADM-02',  'fp-demo-bog-adm-02',  'Windows 11 Pro 24H2', '1.0.0', 'jperez',    'online',      now() - interval '6 minutes',  v_profile_ofi, now() - interval '2 days'),
    (v_org_id, 'BOG-CONT-01', 'fp-demo-bog-cont-01', 'Windows 10 Pro 22H2', '1.0.0', 'clopez',    'online',      now() - interval '11 minutes', v_profile_ofi, now() - interval '5 days'),
    (v_org_id, 'MED-COM-01',  'fp-demo-med-com-01',  'Windows 11 Pro 24H2', '1.0.0', 'agomez',    'offline',     now() - interval '3 days',     v_profile_cam, now() - interval '9 days'),
    (v_org_id, 'MED-COM-02',  'fp-demo-med-com-02',  'Windows 11 Pro 23H2', '0.9.2', 'dtorres',   'quarantined', now() - interval '40 minutes', v_profile_cam, now() - interval '12 days'),
    (v_org_id, 'BOG-REC-01',  'fp-demo-bog-rec-01',  'Windows 10 Pro 22H2', '1.0.0', 'jperez',    'offline',     now() - interval '5 hours',    null,          null)
  on conflict (organization_id, machine_fingerprint) do update
    set last_seen_at = excluded.last_seen_at,
        status       = excluded.status;

  -- ---------------------------------------------------------------------------
  -- Telemetria de los ultimos 14 dias
  -- ---------------------------------------------------------------------------
  for v_endpoint in
    select id, hostname, last_logged_user
      from public.endpoints
     where organization_id = v_org_id and machine_fingerprint like 'fp-demo-%'
  loop
    for v_day in
      select generate_series((current_date - 13), current_date, interval '1 day')::date
    loop
      -- Los fines de semana casi no hay actividad: sin esto, el reporte de uso
      -- por dia de semana sale plano y no permite validar el grafico.
      continue when extract(isodow from v_day) >= 6 and random() > 0.15;

      insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
      select v_org_id, v_endpoint.id, e.event_type, ts.occurred_at, e.payload
      from (
        select
          (array['app_open','web_visit','file_modified','file_created','window_focus','app_open','web_visit','file_modified'])[1 + (random() * 7)::int]::public.event_type as event_type,
          i as seq
        from generate_series(1, 25 + (random() * 25)::int) as i
      ) base
      -- Jornada laboral 7:00-19:00 con ruido de minutos y segundos.
      cross join lateral (
        select (
          v_day
            + make_interval(hours => 7 + (random() * 12)::int)
            + make_interval(mins  => (random() * 59)::int)
            + make_interval(secs  => (random() * 59)::int)
        ) as occurred_at
      ) ts
      cross join lateral (
        select
          base.event_type,
          case base.event_type
            when 'app_open' then jsonb_build_object(
              'app',      c_apps[1 + (random() * 7)::int],
              'category', c_categories[1 + (random() * 7)::int],
              'duration_seconds', (random() * 3600)::int,
              'user',     v_endpoint.last_logged_user)
            when 'window_focus' then jsonb_build_object(
              'app',      c_apps[1 + (random() * 7)::int],
              'duration_seconds', (random() * 900)::int,
              'user',     v_endpoint.last_logged_user)
            when 'web_visit' then jsonb_build_object(
              'domain',   c_domains[1 + (random() * 7)::int],
              'browser',  'chrome.exe',
              'duration_seconds', (random() * 600)::int,
              'user',     v_endpoint.last_logged_user)
            else jsonb_build_object(
              'path',     format(c_folders[1 + (random() * 4)::int], v_endpoint.last_logged_user) || '\' || c_files[1 + (random() * 4)::int],
              'size_bytes', (random() * 5000000)::bigint,
              'extension', '.' || split_part(c_files[1 + (random() * 4)::int], '.', 2),
              'process',  c_apps[1 + (random() * 7)::int],
              'user',     v_endpoint.last_logged_user)
          end as payload
      ) e
      -- El dia en curso solo se puebla hasta la hora actual. Un panel que
      -- muestra actividad de las 6 de la tarde a las 8 de la mañana destruye la
      -- credibilidad de la demostracion entera.
      where ts.occurred_at <= now();

      get diagnostics v_events = row_count;
    end loop;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Eventos de exfiltracion + incidentes correlacionados
  -- ---------------------------------------------------------------------------
  -- Se insertan aparte para poder emparejar cada incidente con el evento que lo
  -- origino, tal como hara el pipeline de ingesta real.
  declare
    v_ep    uuid;
    v_evt   uuid;
    v_when  timestamptz;
  begin
    -- 1. Copia de nomina a un USB no autorizado (critico)
    select id into v_ep from public.endpoints
     where organization_id = v_org_id and hostname = 'MED-COM-02';
    v_when := now() - interval '2 days' - interval '4 hours';

    insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
    values (v_org_id, v_ep, 'usb_connected', v_when, jsonb_build_object(
      'vendor_id','0951','product_id','1666','serial','KINGSTON-A7F31C',
      'label','SIN ETIQUETA','capacity_bytes',31000000000,
      'enforcement','block','user','dtorres'))
    returning id into v_evt;

    insert into public.dlp_incidents (
      organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
      rule_triggered, rule_channel, severity, status, enforcement_action, detected_at
    ) values (
      v_org_id, v_ep, v_evt, v_when,
      jsonb_build_object('serial','KINGSTON-A7F31C','user','dtorres','capacity_bytes',31000000000),
      'usb.dispositivo_no_autorizado', 'usb', 'critical', 'open', 'blocked', v_when
    );

    -- 2. Subida a nube personal (alta)
    select id into v_ep from public.endpoints
     where organization_id = v_org_id and hostname = 'BOG-CONT-01';
    v_when := now() - interval '1 day' - interval '2 hours';

    insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
    values (v_org_id, v_ep, 'web_visit', v_when, jsonb_build_object(
      'domain','wetransfer.com','browser','chrome.exe','blocked',true,'user','clopez'))
    returning id into v_evt;

    insert into public.dlp_incidents (
      organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
      rule_triggered, rule_channel, severity, status, enforcement_action, detected_at
    ) values (
      v_org_id, v_ep, v_evt, v_when,
      jsonb_build_object('domain','wetransfer.com','user','clopez'),
      'web.dominio_bloqueado', 'web', 'high', 'open', 'blocked', v_when
    );

    -- 3. Copia masiva al portapapeles desde el ERP (alta)
    select id into v_ep from public.endpoints
     where organization_id = v_org_id and hostname = 'BOG-ADM-01';
    v_when := now() - interval '6 hours';

    insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
    values (v_org_id, v_ep, 'clipboard_copy', v_when, jsonb_build_object(
      'source_app','sap.exe','target_app','chrome.exe','bytes',184320,
      'format','text','enforcement','alert','user','mrestrepo'))
    returning id into v_evt;

    insert into public.dlp_incidents (
      organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
      rule_triggered, rule_channel, severity, status, enforcement_action, detected_at
    ) values (
      v_org_id, v_ep, v_evt, v_when,
      jsonb_build_object('source_app','sap.exe','target_app','chrome.exe','bytes',184320),
      'clipboard.copia_desde_origen_protegido', 'clipboard', 'high', 'open', 'alerted', v_when
    );

    -- 4. Impresion de cartera fuera de horario (media)
    select id into v_ep from public.endpoints
     where organization_id = v_org_id and hostname = 'BOG-ADM-02';
    v_when := now() - interval '4 days' + interval '3 hours';

    insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
    values (v_org_id, v_ep, 'print_job', v_when, jsonb_build_object(
      'printer','HP-LaserJet-Recepcion','document','cartera_clientes.xlsx','pages',47,
      'enforcement','log','user','jperez'))
    returning id into v_evt;

    insert into public.dlp_incidents (
      organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
      rule_triggered, rule_channel, severity, status, enforcement_action, detected_at
    ) values (
      v_org_id, v_ep, v_evt, v_when,
      jsonb_build_object('document','cartera_clientes.xlsx','pages',47),
      'print.trabajo_intervenido', 'print', 'medium', 'open', 'allowed', v_when
    );

    -- 5. Guardado fuera de carpeta autorizada — ya revisado y descartado
    select id into v_ep from public.endpoints
     where organization_id = v_org_id and hostname = 'BOG-ADM-01';
    v_when := now() - interval '8 days';

    insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
    values (v_org_id, v_ep, 'file_created', v_when, jsonb_build_object(
      'path','C:\Users\mrestrepo\Downloads\balance_2026.pdf','size_bytes',2400000,
      'extension','.pdf','process','chrome.exe','user','mrestrepo'))
    returning id into v_evt;

    insert into public.dlp_incidents (
      organization_id, endpoint_id, event_id, event_occurred_at, event_snapshot,
      rule_triggered, rule_channel, severity, status, enforcement_action, detected_at,
      reviewed_by, reviewed_at, review_notes
    ) values (
      v_org_id, v_ep, v_evt, v_when,
      jsonb_build_object('path','C:\Users\mrestrepo\Downloads\balance_2026.pdf'),
      'storage.carpeta_no_autorizada', 'storage', 'low', 'false_positive', 'allowed', v_when,
      (select id from public.users where organization_id = v_org_id order by created_at limit 1),
      v_when + interval '3 hours',
      'Descarga del portal contable de la propia empresa. Se ajusta la regla.'
    );
  end;

  -- ---------------------------------------------------------------------------
  -- Agregados diarios
  -- ---------------------------------------------------------------------------
  -- Se consolidan los mismos dias que se acaban de sembrar, para que los
  -- reportes historicos tengan de donde leer sin esperar al job nocturno.
  for v_day in
    select generate_series((current_date - 13), current_date, interval '1 day')::date
  loop
    perform public.rollup_activity_day(v_day);
  end loop;

  raise notice 'Listo. Equipos: %, eventos: %, incidentes: %',
    (select count(*) from public.endpoints where organization_id = v_org_id),
    (select count(*) from public.activity_events where organization_id = v_org_id),
    (select count(*) from public.dlp_incidents where organization_id = v_org_id);
end
$seed$;
