-- =============================================================================
-- Nortis | Sedes Fase 3: escritura delegada por sede + asignacion de usuarios
-- =============================================================================
-- La Fase 2 aislo la LECTURA. Esta fase cierra la ESCRITURA: un delegado (admin
-- con users.site_id) solo puede actuar sobre equipos de SU sede, aunque conozca
-- el id de otro. Un central (site_id null) mantiene su alcance total.

-- ---------------------------------------------------------------------------
-- 1. UPDATE de endpoints acotado por sede (perfil, etc.). Restrictiva: se combina
--    con AND con la politica de escritura existente. Un delegado no puede tocar
--    el equipo de otra sede.
drop policy if exists "endpoints_update_site_scope" on public.endpoints;
create policy "endpoints_update_site_scope" on public.endpoints
  as restrictive for update to authenticated
  using (
    (select public.current_site_id()) is null
    or site_id = (select public.current_site_id())
  );

-- ---------------------------------------------------------------------------
-- 2. create_quarantine_action: si quien llama es delegado, el equipo debe ser de
--    su sede. Se recrea anadiendo esa comprobacion; el resto es identico.
create or replace function public.create_quarantine_action(
  p_endpoint_id uuid, p_kind text, p_quarantine_id text, p_original_path text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := public.current_org_id(); v_site uuid := public.current_site_id(); v_id uuid;
begin
  if v_org is null then
    raise exception 'Sesion requerida' using errcode = '42501';
  end if;
  if not public.is_org_admin() then
    raise exception 'Solo owner o admin pueden actuar sobre la cuarentena' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor' using errcode = '42501';
  end if;
  if p_kind not in ('restore_file', 'delete_quarantine') then
    raise exception 'accion invalida';
  end if;
  if not exists (
    select 1 from public.endpoints where id = p_endpoint_id and organization_id = v_org
      and (v_site is null or site_id = v_site)
  ) then
    raise exception 'equipo no encontrado' using errcode = '42501';
  end if;

  insert into public.agent_commands
    (organization_id, endpoint_id, kind, quarantine_id, original_path, created_by)
  values
    (v_org, p_endpoint_id, p_kind::public.agent_command_kind, p_quarantine_id, p_original_path, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. issue_agent_task: misma comprobacion de sede. Conserva la firma con
--    p_not_before de la fase de programador.
create or replace function public.issue_agent_task(
  p_endpoint_id uuid,
  p_kind        text,
  p_payload     text,
  p_expires_at  timestamptz,
  p_signature   text,
  p_not_before  timestamptz default now())
returns uuid
language plpgsql security definer set search_path = ''
as $$
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
  if p_kind not in ('install_msi', 'push_file', 'restart') then
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
$$;

-- ---------------------------------------------------------------------------
-- 4. set_user_site: asignar (o quitar) la sede de un usuario. SOLO la consola
--    central lo hace: un delegado no reorganiza usuarios (decision: central +
--    delegado limitado). Exige admin + segundo factor.
create function public.set_user_site(p_user_id uuid, p_site_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := public.current_org_id();
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'Solo owner o admin' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor' using errcode = '42501';
  end if;
  if (select public.current_site_id()) is not null then
    raise exception 'Solo la consola central gestiona las sedes de los usuarios' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = p_user_id and organization_id = v_org) then
    raise exception 'usuario no encontrado' using errcode = '42501';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id and organization_id = v_org
  ) then
    raise exception 'sede no encontrada' using errcode = '42501';
  end if;

  update public.users set site_id = p_site_id where id = p_user_id;
end;
$$;

revoke execute on function public.set_user_site(uuid, uuid) from public, anon;
grant  execute on function public.set_user_site(uuid, uuid) to authenticated;
