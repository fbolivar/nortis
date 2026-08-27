-- Vigilancia de cuentas: el reporte de inventario compara la foto de cuentas con
-- la anterior y abre incidentes ante cambios sensibles (nuevo administrador,
-- cuenta nueva, cuenta integrada habilitada) o exceso de inicios fallidos.
--
-- Todo se apoya en hardware_info.accounts que ya reporta el agente (>= 1.0.27).
-- Las comparaciones solo corren si hay una foto previa: el primer inventario de
-- un equipo NO dispara alertas (si no, todo seria "nuevo").

create or replace function public.agent_report_inventory(
  p_credential text, p_hardware jsonb, p_software jsonb, p_ip text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_auth record;
        v_ip text := nullif(trim(coalesce(p_ip, '')), '');
        v_old_ip text;
        v_old_acc jsonb;
        v_new_acc jsonb := p_hardware -> 'accounts';
        v_new_admins text[];
        v_new_users text[];
        v_sensibles text[];
        v_fail int;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  select public_ip, hardware_info -> 'accounts'
    into v_old_ip, v_old_acc
    from public.endpoints where id = v_auth.endpoint_id;

  update public.endpoints
     set hardware_info = p_hardware, inventory_at = now(),
         public_ip = coalesce(v_ip, public_ip),
         public_ip_at = case when v_ip is not null then now() else public_ip_at end
   where id = v_auth.endpoint_id;

  -- Cambio de IP publica (red).
  if v_ip is not null and v_old_ip is not null and v_ip <> v_old_ip then
    insert into public.dlp_incidents as di
      (organization_id, endpoint_id, event_occurred_at, event_snapshot, rule_triggered,
       rule_channel, severity, status, detected_at)
    values
      (v_auth.organization_id, v_auth.endpoint_id, now(),
       jsonb_build_object('from', v_old_ip, 'to', v_ip, 'sample', v_ip),
       'network.cambio_de_red', 'network', 'medium'::public.incident_severity, 'open', now())
    on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
      set event_snapshot = excluded.event_snapshot, detected_at = excluded.detected_at
      where di.status = 'open';
  end if;

  -- Vigilancia de cuentas (solo con foto previa).
  if v_new_acc is not null and v_old_acc is not null then
    -- Administradores que no estaban antes.
    v_new_admins := array(
      select a from jsonb_array_elements_text(coalesce(v_new_acc -> 'admins', '[]'::jsonb)) a
       where a not in (
         select b from jsonb_array_elements_text(coalesce(v_old_acc -> 'admins', '[]'::jsonb)) b
       )
    );
    if coalesce(array_length(v_new_admins, 1), 0) > 0 then
      insert into public.dlp_incidents as di
        (organization_id, endpoint_id, event_occurred_at, event_snapshot, rule_triggered,
         rule_channel, severity, status, detected_at)
      values
        (v_auth.organization_id, v_auth.endpoint_id, now(),
         jsonb_build_object('nuevos', to_jsonb(v_new_admins), 'sample', array_to_string(v_new_admins, ', ')),
         'accounts.nuevo_administrador', 'accounts', 'high'::public.incident_severity, 'open', now())
      on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
        set event_snapshot = excluded.event_snapshot, detected_at = excluded.detected_at
        where di.status = 'open';
    end if;

    -- Cuentas locales que no estaban antes (por nombre).
    v_new_users := array(
      select u ->> 'Name' from jsonb_array_elements(coalesce(v_new_acc -> 'users', '[]'::jsonb)) u
       where (u ->> 'Name') not in (
         select uu ->> 'Name' from jsonb_array_elements(coalesce(v_old_acc -> 'users', '[]'::jsonb)) uu
       )
    );
    if coalesce(array_length(v_new_users, 1), 0) > 0 then
      insert into public.dlp_incidents as di
        (organization_id, endpoint_id, event_occurred_at, event_snapshot, rule_triggered,
         rule_channel, severity, status, detected_at)
      values
        (v_auth.organization_id, v_auth.endpoint_id, now(),
         jsonb_build_object('nuevas', to_jsonb(v_new_users), 'sample', array_to_string(v_new_users, ', ')),
         'accounts.cuenta_nueva', 'accounts', 'medium'::public.incident_severity, 'open', now())
      on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
        set event_snapshot = excluded.event_snapshot, detected_at = excluded.detected_at
        where di.status = 'open';
    end if;

    -- Cuenta integrada sensible (Administrador/Invitado) que pasa a habilitada.
    v_sensibles := array(
      select u ->> 'Name'
        from jsonb_array_elements(coalesce(v_new_acc -> 'users', '[]'::jsonb)) u
       where lower(u ->> 'Name') in ('administrator', 'administrador', 'guest', 'invitado')
         and (u ->> 'Enabled') = 'true'
         and coalesce((
           select uu ->> 'Enabled'
             from jsonb_array_elements(coalesce(v_old_acc -> 'users', '[]'::jsonb)) uu
            where uu ->> 'Name' = u ->> 'Name' limit 1
         ), 'false') = 'false'
    );
    if coalesce(array_length(v_sensibles, 1), 0) > 0 then
      insert into public.dlp_incidents as di
        (organization_id, endpoint_id, event_occurred_at, event_snapshot, rule_triggered,
         rule_channel, severity, status, detected_at)
      values
        (v_auth.organization_id, v_auth.endpoint_id, now(),
         jsonb_build_object('cuentas', to_jsonb(v_sensibles), 'sample', array_to_string(v_sensibles, ', ')),
         'accounts.cuenta_sensible_habilitada', 'accounts', 'high'::public.incident_severity, 'open', now())
      on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
        set event_snapshot = excluded.event_snapshot, detected_at = excluded.detected_at
        where di.status = 'open';
    end if;
  end if;

  -- Exceso de inicios de sesion fallidos en 24 h (posible fuerza bruta). No
  -- necesita foto previa: es un umbral sobre el valor actual.
  v_fail := coalesce((v_new_acc ->> 'failed_logons_24h')::int, 0);
  if v_fail >= 10 then
    insert into public.dlp_incidents as di
      (organization_id, endpoint_id, event_occurred_at, event_snapshot, rule_triggered,
       rule_channel, severity, status, detected_at)
    values
      (v_auth.organization_id, v_auth.endpoint_id, now(),
       jsonb_build_object('count', v_fail, 'sample', v_fail || ' intentos fallidos en 24 h'),
       'accounts.inicios_fallidos', 'accounts', 'high'::public.incident_severity, 'open', now())
    on conflict (organization_id, endpoint_id, rule_triggered, occurrence_day) do update
      set event_snapshot = excluded.event_snapshot, detected_at = excluded.detected_at
      where di.status = 'open';
  end if;

  delete from public.endpoint_software where endpoint_id = v_auth.endpoint_id;

  insert into public.endpoint_software (organization_id, endpoint_id, name, version, publisher)
  select v_auth.organization_id, v_auth.endpoint_id,
         left(elem ->> 'name', 300), left(elem ->> 'version', 100), left(elem ->> 'publisher', 200)
    from (
      select value as elem from jsonb_array_elements(coalesce(p_software, '[]'::jsonb))
       where coalesce(value ->> 'name', '') <> ''
       limit 3000
    ) s;
end;
$$;
grant execute on function public.agent_report_inventory(text, jsonb, jsonb, text) to anon;
