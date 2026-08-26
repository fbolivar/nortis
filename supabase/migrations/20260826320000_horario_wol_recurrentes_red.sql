-- =============================================================================
-- Nortis | Wake-on-LAN, scripts recurrentes y alerta de cambio de red
-- =============================================================================
-- Dos tipos de tarea nuevos (wake, schedule_script) y la deteccion de cambio de
-- red publica en el reporte de inventario.

alter type public.agent_task_kind add value if not exists 'wake';
alter type public.agent_task_kind add value if not exists 'schedule_script';

create or replace function public.issue_agent_task(
  p_endpoint_id uuid, p_kind text, p_payload text, p_expires_at timestamptz,
  p_signature text, p_not_before timestamptz default now())
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_org uuid := public.current_org_id(); v_site uuid := public.current_site_id(); v_id uuid;
begin
  if v_org is null then raise exception 'Sesion requerida' using errcode='42501'; end if;
  if not public.is_org_admin() then raise exception 'Solo owner o admin pueden emitir tareas' using errcode='42501'; end if;
  if not public.mfa_satisfied() then raise exception 'Se requiere segundo factor' using errcode='42501'; end if;
  if p_kind not in ('install_msi','push_file','restart','run_script','lock','wipe','screenshot','message','kill','uninstall','wake','schedule_script') then
    raise exception 'accion invalida';
  end if;
  if coalesce(length(p_signature),0)=0 then raise exception 'la tarea debe venir firmada' using errcode='22023'; end if;
  if not exists (select 1 from public.endpoints where id=p_endpoint_id and organization_id=v_org and (v_site is null or site_id=v_site)) then
    raise exception 'equipo no encontrado' using errcode='42501';
  end if;
  insert into public.agent_tasks (organization_id, endpoint_id, kind, payload, expires_at, signature, not_before, created_by)
  values (v_org, p_endpoint_id, p_kind::public.agent_task_kind, p_payload, p_expires_at, p_signature, coalesce(p_not_before, now()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$function$;

-- Deteccion de cambio de red: el reporte de inventario compara la IP publica con
-- la anterior y, si cambio, abre un incidente 'network.cambio_de_red'.
create or replace function public.agent_report_inventory(
  p_credential text, p_hardware jsonb, p_software jsonb, p_ip text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_auth record;
        v_ip text := nullif(trim(coalesce(p_ip, '')), '');
        v_old_ip text;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  select public_ip into v_old_ip from public.endpoints where id = v_auth.endpoint_id;

  update public.endpoints
     set hardware_info = p_hardware, inventory_at = now(),
         public_ip = coalesce(v_ip, public_ip),
         public_ip_at = case when v_ip is not null then now() else public_ip_at end
   where id = v_auth.endpoint_id;

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
