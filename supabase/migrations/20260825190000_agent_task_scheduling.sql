-- =============================================================================
-- Nortis | Programador de tareas (scheduling) — una sola vez, a hora futura
-- =============================================================================
-- Agendar una tarea (install_msi/push_file/restart) para una hora futura: un
-- reinicio a las 2am, un despliegue despues del horario laboral. Es puramente
-- server-side: el agente ya solo ejecuta lo que recibe, asi que basta con no
-- entregarle la tarea hasta que llegue su hora (`not_before`). No hace falta
-- tocar el agente ni firmar el `not_before` — es una compuerta de ENTREGA, no de
-- ejecucion: quien pudiera cambiarlo necesitaria escribir en la base (ya
-- privilegiado) y aun asi no podria forjar la firma de la tarea.

alter table public.agent_tasks
  add column if not exists not_before timestamptz not null default now();

-- El poll no entrega una tarea antes de su hora.
create or replace function public.agent_poll_tasks(p_credential text, p_endpoint_id uuid)
returns table (id uuid, kind text, payload text, expires_at timestamptz, signature text)
language plpgsql security definer set search_path = ''
as $$
declare v_auth record;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  if p_endpoint_id is distinct from v_auth.endpoint_id then
    raise exception 'La credencial no corresponde a ese equipo' using errcode = '42501';
  end if;
  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  return query
  update public.agent_tasks t
     set status = 'sent', sent_at = now()
   where t.endpoint_id = v_auth.endpoint_id
     and t.status = 'pending'
     and t.not_before <= now()
  returning t.id, t.kind::text, t.payload, t.expires_at, t.signature;
end;
$$;

-- issue_agent_task gana p_not_before. Se recrea (cambia la firma), asi que se
-- borra la version anterior y se re-otorga el permiso.
drop function if exists public.issue_agent_task(uuid, text, text, timestamptz, text);

create function public.issue_agent_task(
  p_endpoint_id uuid,
  p_kind        text,
  p_payload     text,
  p_expires_at  timestamptz,
  p_signature   text,
  p_not_before  timestamptz default now())
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := public.current_org_id(); v_id uuid;
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

revoke execute on function public.issue_agent_task(uuid, text, text, timestamptz, text, timestamptz) from public, anon;
grant  execute on function public.issue_agent_task(uuid, text, text, timestamptz, text, timestamptz) to authenticated;
