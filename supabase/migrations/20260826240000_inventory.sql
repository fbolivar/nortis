-- =============================================================================
-- Nortis | Inventario de software y hardware
-- =============================================================================
-- El agente reporta el hardware (jsonb en el equipo) y el software instalado
-- (una fila por programa). El software se REEMPLAZA en cada reporte: asi un
-- programa desinstalado desaparece del inventario sin logica de diffing.
--
-- Se reporta por un RPC de agente (SECURITY DEFINER, autenticado por credencial),
-- igual que el resto de la superficie /api/agent: nada de service_role.

alter table public.endpoints
  add column if not exists hardware_info jsonb,
  add column if not exists inventory_at timestamptz;

-- La tabla endpoints tiene grants a nivel de columna para `authenticated`; las
-- columnas nuevas hay que concederlas explicitamente o no se pueden leer.
grant select (hardware_info, inventory_at) on public.endpoints to authenticated;

create table if not exists public.endpoint_software (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.endpoints(id) on delete cascade,
  name            text not null,
  version         text,
  publisher       text,
  created_at      timestamptz not null default now()
);

create index if not exists endpoint_software_endpoint_idx on public.endpoint_software (endpoint_id);
create index if not exists endpoint_software_org_name_idx on public.endpoint_software (organization_id, lower(name));

alter table public.endpoint_software enable row level security;

-- Lectura por organizacion (miembros del tenant).
drop policy if exists endpoint_software_select on public.endpoint_software;
create policy endpoint_software_select on public.endpoint_software
  for select using (organization_id = (select public.current_org_id()));

-- Acotamiento por sede para consolas delegadas: solo el software de equipos de su
-- sede. Central (sin sede) ve todo. Mismo patron restrictivo que el resto.
drop policy if exists endpoint_software_site_scope on public.endpoint_software;
create policy endpoint_software_site_scope on public.endpoint_software
  as restrictive for select to authenticated
  using (
    (select public.current_site_id()) is null
    or endpoint_id in (select e.id from public.endpoints e where e.site_id = (select public.current_site_id()))
  );

-- Reporte del inventario. Reemplaza el software del equipo y actualiza el hardware.
create or replace function public.agent_report_inventory(
  p_credential text,
  p_hardware jsonb,
  p_software jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_auth record;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  update public.endpoints
     set hardware_info = p_hardware, inventory_at = now()
   where id = v_auth.endpoint_id;

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

revoke execute on function public.agent_report_inventory(text, jsonb, jsonb) from public;
grant   execute on function public.agent_report_inventory(text, jsonb, jsonb) to anon;
