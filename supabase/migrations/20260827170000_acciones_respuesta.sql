-- Acciones de respuesta: tres tipos de tarea firmada nuevos.
--   account_action  (deshabilitar/habilitar/eliminar cuenta, cerrar sesion)
--   harden          (activar firewall / Defender)
--   network_isolate (cuarentena de red reversible)

alter type public.agent_task_kind add value if not exists 'account_action';
alter type public.agent_task_kind add value if not exists 'harden';
alter type public.agent_task_kind add value if not exists 'network_isolate';

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
  if p_kind not in ('install_msi','push_file','restart','run_script','lock','wipe','screenshot','message','kill','uninstall','wake','schedule_script','scan_av','refresh_inventory','account_action','harden','network_isolate') then
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
