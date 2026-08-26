-- =============================================================================
-- Nortis | Ejecucion remota administrada (canal de tareas SYSTEM) — Fase 1
-- =============================================================================
-- El agente ya BAJABA politica/version y ya ejecutaba comandos de cuarentena.
-- Esto generaliza el canal a ACCIONES ADMINISTRATIVAS que el agente corre como
-- SYSTEM: instalar un MSI, colocar un archivo, reiniciar. Es la capacidad mas
-- peligrosa del producto, asi que la disciplina de seguridad es el producto:
--
--   1. TODA tarea va FIRMADA por la consola (Ed25519). El agente rechaza lo que
--      no verifique contra su clave publica embebida. Si alguien inyecta una fila
--      en esta tabla, el agente NO la ejecuta: no tiene la clave privada. Esta es
--      la propiedad central — la firma no se comprueba aqui (Postgres no la tiene)
--      sino en el agente, que es quien no confia en la base.
--   2. Emitir exige admin + segundo factor (como create_quarantine_action).
--   3. Catalogo cerrado de acciones (enum), nunca shell arbitrario.
--   4. El artefacto se valida por sha256 en el agente antes de ejecutarse.
--   5. Auditoria completa: quien, que, cuando, resultado (exit code + salida).

create type public.agent_task_kind   as enum ('install_msi', 'push_file', 'restart');
create type public.agent_task_status as enum ('pending', 'sent', 'running', 'done', 'failed');

create table public.agent_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.endpoints(id)     on delete cascade,
  kind            public.agent_task_kind not null,
  -- Payload como TEXTO, no jsonb: la firma se calcula sobre estos bytes exactos y
  -- jsonb los reserializaria (reordena claves, cambia espacios), rompiendo la
  -- verificacion. El agente lo parsea el mismo. Contenido segun `kind`:
  --   install_msi -> {"url","sha256","args"?}
  --   push_file   -> {"url","sha256","dest_path"}
  --   restart     -> {}
  payload         text not null,
  -- Caduca la firma: acota la reejecucion de una tarea copiada. El agente rechaza
  -- una tarea vencida aunque la firma sea valida.
  expires_at      timestamptz not null,
  -- Firma Ed25519 (base64) de la consola sobre el payload canonico. Ver
  -- agent-signing.ts (consola) e internal/remoteexec (agente): AMBOS construyen
  -- exactamente los mismos bytes o la verificacion falla.
  signature       text not null,
  status          public.agent_task_status not null default 'pending',
  exit_code       integer,
  output          text,
  error           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  completed_at    timestamptz
);

-- El agente pregunta "¿algo pendiente para mi?" a menudo; que no recorra el
-- historico de tareas cumplidas.
create index agent_tasks_pendientes
  on public.agent_tasks (endpoint_id) where status = 'pending';

alter table public.agent_tasks enable row level security;

-- Lectura para miembros del tenant (la consola muestra estado y salida). La
-- escritura no va por RLS: pasa por los RPC de abajo.
drop policy if exists "agent_tasks_read" on public.agent_tasks;
create policy "agent_tasks_read"
  on public.agent_tasks for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- ---------------------------------------------------------------------------
-- issue_agent_task: la consola encarga una tarea YA FIRMADA. La firma la calcula
-- el servidor Next.js (tiene la clave privada); aqui solo se comprueba autoridad
-- y se almacena. Solo admin con segundo factor: desplegar software en la flota es
-- la accion mas sensible del producto.
create function public.issue_agent_task(
  p_endpoint_id uuid,
  p_kind        text,
  p_payload     text,
  p_expires_at  timestamptz,
  p_signature   text)
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
  -- El equipo debe pertenecer a la organizacion de quien llama.
  if not exists (
    select 1 from public.endpoints where id = p_endpoint_id and organization_id = v_org
  ) then
    raise exception 'equipo no encontrado' using errcode = '42501';
  end if;

  insert into public.agent_tasks
    (organization_id, endpoint_id, kind, payload, expires_at, signature, created_by)
  values
    (v_org, p_endpoint_id, p_kind::public.agent_task_kind, p_payload, p_expires_at,
     p_signature, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- agent_poll_tasks: el agente reclama sus tareas pendientes. Las marca 'sent' de
-- forma atomica al devolverlas. Autenticado por la credencial del equipo.
create function public.agent_poll_tasks(p_credential text, p_endpoint_id uuid)
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
   where t.endpoint_id = v_auth.endpoint_id and t.status = 'pending'
  returning t.id, t.kind::text, t.payload, t.expires_at, t.signature;
end;
$$;

-- ---------------------------------------------------------------------------
-- agent_report_task: el agente informa el resultado (exit code + salida). Trunca
-- la salida a 8k: es evidencia de auditoria, no un canal de exfiltracion de logs.
create function public.agent_report_task(
  p_credential text, p_endpoint_id uuid, p_task_id uuid,
  p_status text, p_exit_code integer default null,
  p_output text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_auth record;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  if p_endpoint_id is distinct from v_auth.endpoint_id then
    raise exception 'La credencial no corresponde a ese equipo' using errcode = '42501';
  end if;
  if p_status not in ('running', 'done', 'failed') then
    raise exception 'estado invalido' using errcode = '22023';
  end if;

  update public.agent_tasks
     set status       = p_status::public.agent_task_status,
         exit_code    = p_exit_code,
         output       = left(p_output, 8192),
         error        = left(p_error, 2000),
         completed_at = case when p_status in ('done', 'failed') then now() else completed_at end
   where id = p_task_id and endpoint_id = v_auth.endpoint_id;
end;
$$;

-- Permisos: los del agente callables por anon (presenta credencial); el de la
-- consola por usuarios autenticados (el RPC exige admin + MFA dentro).
revoke execute on function public.issue_agent_task(uuid, text, text, timestamptz, text) from public, anon;
revoke execute on function public.agent_poll_tasks(text, uuid)                          from public, authenticated;
revoke execute on function public.agent_report_task(text, uuid, uuid, text, integer, text, text) from public, authenticated;

grant execute on function public.issue_agent_task(uuid, text, text, timestamptz, text)  to authenticated;
grant execute on function public.agent_poll_tasks(text, uuid)                           to anon;
grant execute on function public.agent_report_task(text, uuid, uuid, text, integer, text, text) to anon;
