-- =============================================================================
-- Nortis | Mas acciones remotas: screenshot, message, kill, uninstall
-- =============================================================================
-- Cuatro tipos de tarea nuevos sobre el mismo canal firmado (Ed25519+admin+MFA):
--   screenshot: captura de pantalla bajo demanda (gateada por consentimiento en
--               el RPC de subida).
--   message:    aviso emergente en la pantalla del usuario.
--   kill:       terminar un proceso por nombre.
--   uninstall:  desinstalar un programa (por su DisplayName del inventario).

alter type public.agent_task_kind add value if not exists 'screenshot';
alter type public.agent_task_kind add value if not exists 'message';
alter type public.agent_task_kind add value if not exists 'kill';
alter type public.agent_task_kind add value if not exists 'uninstall';

create or replace function public.issue_agent_task(
  p_endpoint_id uuid, p_kind text, p_payload text, p_expires_at timestamptz,
  p_signature text, p_not_before timestamptz default now())
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_org uuid := public.current_org_id(); v_site uuid := public.current_site_id(); v_id uuid;
begin
  if v_org is null then
    raise exception 'Sesion requerida' using errcode = '42501';
  end if;
  if not public.is_org_admin() then
    raise exception 'Solo owner o admin pueden emitir tareas' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor' using errcode = '42501';
  end if;
  if p_kind not in ('install_msi','push_file','restart','run_script','lock','wipe','screenshot','message','kill','uninstall') then
    raise exception 'accion invalida';
  end if;
  if coalesce(length(p_signature), 0) = 0 then
    raise exception 'la tarea debe venir firmada' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.endpoints where id = p_endpoint_id and organization_id = v_org
      and (v_site is null or site_id = v_site)
  ) then
    raise exception 'equipo no encontrado' using errcode = '42501';
  end if;

  insert into public.agent_tasks
    (organization_id, endpoint_id, kind, payload, expires_at, signature, not_before, created_by)
  values
    (v_org, p_endpoint_id, p_kind::public.agent_task_kind, p_payload, p_expires_at,
     p_signature, coalesce(p_not_before, now()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$function$;
