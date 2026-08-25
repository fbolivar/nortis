-- =============================================================================
-- Nortis | Canal de comandos consola -> agente (restaurar/eliminar cuarentena)
-- =============================================================================
-- Hasta ahora el agente solo BAJABA cosas (politica, version). La revision de
-- cuarentena necesita lo contrario: que la consola ENCARGUE una accion al equipo
-- —restaurar un archivo retirado, o borrarlo definitivamente— y el agente la
-- ejecute y reporte. Este es ese canal, con la misma disciplina que el resto de
-- la superficie del agente: la autoridad la da la credencial del equipo, no un
-- rol; y encargar una accion exige admin con segundo factor.

create type public.agent_command_kind   as enum ('restore_file', 'delete_quarantine');
create type public.agent_command_status as enum ('pending', 'sent', 'done', 'failed');

create table public.agent_commands (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.endpoints(id)     on delete cascade,
  kind            public.agent_command_kind not null,
  -- Identifica el archivo dentro de la carpeta de cuarentena del equipo. NO es
  -- una ruta arbitraria: es el nombre que el agente reporto al retirarlo.
  quarantine_id   text not null,
  -- A donde restaurar (la ruta original). Se conserva aunque la accion sea borrar,
  -- como registro de que se retiro de ahi.
  original_path   text not null,
  status          public.agent_command_status not null default 'pending',
  error           text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  completed_at    timestamptz
);

-- Indice parcial: el agente pregunta "¿algo pendiente para mi?" a menudo; que esa
-- consulta no recorra el historico de comandos ya cumplidos.
create index agent_commands_pendientes
  on public.agent_commands (endpoint_id) where status = 'pending';

alter table public.agent_commands enable row level security;

-- Lectura para los miembros del tenant: la consola muestra el estado de cada
-- accion (pendiente / hecha / fallo). La escritura NO va por RLS: pasa por los
-- RPC de abajo, que comprueban rol y credencial.
drop policy if exists "agent_commands_read" on public.agent_commands;
create policy "agent_commands_read"
  on public.agent_commands for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- ---------------------------------------------------------------------------
-- agent_poll_commands: el agente reclama sus comandos pendientes.
-- Los marca 'sent' de forma atomica al devolverlos, para no repetir el encargo
-- si vuelve a preguntar antes de terminar. Autenticado por la credencial del
-- equipo, como el resto de la superficie /api/agent.
create function public.agent_poll_commands(p_credential text, p_endpoint_id uuid)
returns table (id uuid, kind text, quarantine_id text, original_path text)
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
  update public.agent_commands c
     set status = 'sent', sent_at = now()
   where c.endpoint_id = v_auth.endpoint_id and c.status = 'pending'
  returning c.id, c.kind::text, c.quarantine_id, c.original_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- agent_report_command: el agente informa el resultado de un comando.
create function public.agent_report_command(
  p_credential text, p_endpoint_id uuid, p_command_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_auth record;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  if p_endpoint_id is distinct from v_auth.endpoint_id then
    raise exception 'La credencial no corresponde a ese equipo' using errcode = '42501';
  end if;
  if p_status not in ('done', 'failed') then
    raise exception 'estado invalido' using errcode = '22023';
  end if;

  update public.agent_commands
     set status = p_status::public.agent_command_status,
         error = p_error,
         completed_at = now()
   where id = p_command_id and endpoint_id = v_auth.endpoint_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_quarantine_action: la consola encarga restaurar o borrar. Solo un admin
-- con segundo factor —restaurar un archivo o borrarlo son acciones sensibles—.
create function public.create_quarantine_action(
  p_endpoint_id uuid, p_kind text, p_quarantine_id text, p_original_path text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := public.current_org_id(); v_id uuid;
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
  -- El equipo debe pertenecer a la organizacion de quien llama: no se encarga
  -- una accion sobre el equipo de otro tenant.
  if not exists (
    select 1 from public.endpoints where id = p_endpoint_id and organization_id = v_org
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

-- Permisos: los del agente, callables por anon (presenta credencial); el de la
-- consola, por usuarios autenticados (el RPC ya exige admin + MFA dentro).
revoke execute on function public.agent_poll_commands(text, uuid)                  from public, authenticated;
revoke execute on function public.agent_report_command(text, uuid, uuid, text, text) from public, authenticated;
revoke execute on function public.create_quarantine_action(uuid, text, text, text)  from public, anon;

grant execute on function public.agent_poll_commands(text, uuid)                   to anon;
grant execute on function public.agent_report_command(text, uuid, uuid, text, text) to anon;
grant execute on function public.create_quarantine_action(uuid, text, text, text)   to authenticated;
