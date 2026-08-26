-- =============================================================================
-- Nortis | Sedes Fase 2: delegacion y aislamiento por RLS
-- =============================================================================
-- Crea el LIMITE de la consola delegada. Un usuario con users.site_id solo ve lo
-- de su sede; uno sin sede (null) es CENTRAL y sigue viendo toda la organizacion,
-- exactamente como hoy.
--
-- El aislamiento se impone con politicas RESTRICTIVAS nuevas (se combinan con AND
-- con las existentes _select_same_org y _require_mfa): no se tocan las politicas
-- actuales, solo se AÑADE una condicion de sede. Un central (current_site_id()
-- null) las pasa siempre. El agente no se ve afectado: entra por RPCs SECURITY
-- DEFINER con rol anon, no authenticated.

-- Delegacion: el usuario pertenece a una sede (null = central).
alter table public.users
  add column if not exists site_id uuid references public.sites(id) on delete set null;

-- current_site_id(): la sede del usuario actual, o null si es central. Misma
-- forma que current_org_id() —STABLE SECURITY DEFINER, search_path vacio— para
-- poder leerse dentro de las politicas sin recursion de RLS.
create or replace function public.current_site_id()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare v_site_id uuid;
begin
  select u.site_id into v_site_id from public.users u where u.id = (select auth.uid());
  return v_site_id;
end;
$$;

-- Los delegados no ven equipos de otra sede. La condicion mira el site_id de la
-- propia fila.
drop policy if exists "endpoints_site_scope" on public.endpoints;
create policy "endpoints_site_scope" on public.endpoints
  as restrictive for select to authenticated
  using (
    (select public.current_site_id()) is null
    or site_id = (select public.current_site_id())
  );

-- Incidentes, actividad y tareas/comandos pertenecen a un equipo: se acotan por
-- el site_id de su endpoint. La subconsulta a endpoints hereda su propio RLS, asi
-- que devuelve solo los equipos que el delegado puede ver — justo su sede.
drop policy if exists "dlp_incidents_site_scope" on public.dlp_incidents;
create policy "dlp_incidents_site_scope" on public.dlp_incidents
  as restrictive for select to authenticated
  using (
    (select public.current_site_id()) is null
    or endpoint_id in (select e.id from public.endpoints e where e.site_id = (select public.current_site_id()))
  );

drop policy if exists "activity_events_site_scope" on public.activity_events;
create policy "activity_events_site_scope" on public.activity_events
  as restrictive for select to authenticated
  using (
    (select public.current_site_id()) is null
    or endpoint_id in (select e.id from public.endpoints e where e.site_id = (select public.current_site_id()))
  );

drop policy if exists "agent_tasks_site_scope" on public.agent_tasks;
create policy "agent_tasks_site_scope" on public.agent_tasks
  as restrictive for select to authenticated
  using (
    (select public.current_site_id()) is null
    or endpoint_id in (select e.id from public.endpoints e where e.site_id = (select public.current_site_id()))
  );

drop policy if exists "agent_commands_site_scope" on public.agent_commands;
create policy "agent_commands_site_scope" on public.agent_commands
  as restrictive for select to authenticated
  using (
    (select public.current_site_id()) is null
    or endpoint_id in (select e.id from public.endpoints e where e.site_id = (select public.current_site_id()))
  );
