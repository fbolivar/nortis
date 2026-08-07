-- =============================================================================
-- Nortis | 05 - endpoints (equipos con agente instalado)
-- =============================================================================
-- El agente Go se registra aqui una vez (provisioning con la API key del tenant)
-- y a partir de ahi se identifica por endpoint_id + machine_fingerprint.
-- =============================================================================

create table public.endpoints (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  hostname            text not null,

  -- Identidad estable de la maquina, derivada por el agente (MachineGuid +
  -- serial de placa, hasheado). Es lo que evita que reinstalar el agente
  -- duplique el endpoint en el inventario y descuadre la facturacion por equipo.
  machine_fingerprint text not null,

  os_version          text,
  agent_version       text,

  -- Usuario de Windows con sesion iniciada mas recientemente. Dato operativo
  -- para el analista; no es una identidad de Nortis.
  last_logged_user    text,

  status              public.endpoint_status not null default 'offline',
  last_seen_at        timestamptz,

  assigned_profile_id uuid references public.security_profiles(id) on delete set null,

  -- Marca de tiempo del ultimo perfil confirmado por el agente. La diferencia
  -- contra security_profiles.updated_at es lo que responde "cuantos equipos
  -- todavia no aplicaron la politica que cambie hace 10 minutos".
  policy_applied_at   timestamptz,

  enrolled_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ON DELETE SET NULL en assigned_profile_id, no CASCADE: borrar un perfil de
-- politica jamas debe borrar el inventario de equipos. El endpoint queda sin
-- perfil y la pagina de cumplimiento lo reporta como descubierto.

create index endpoints_organization_id_idx on public.endpoints (organization_id);
create index endpoints_last_seen_idx on public.endpoints (organization_id, last_seen_at desc nulls last);
create index endpoints_assigned_profile_idx on public.endpoints (assigned_profile_id)
  where assigned_profile_id is not null;

create unique index endpoints_fingerprint_per_org_idx
  on public.endpoints (organization_id, machine_fingerprint);

create trigger endpoints_set_updated_at
  before update on public.endpoints
  for each row execute function public.set_updated_at();

-- Un endpoint solo puede apuntar a un perfil de SU MISMA organizacion. RLS
-- protege la lectura, pero sin esto un INSERT malicioso (o un bug del Route
-- Handler ejecutando con service_role) podria cruzar tenants por FK.
create or replace function public.assert_profile_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_profile_id is not null
     and not exists (
       select 1 from public.security_profiles sp
        where sp.id = new.assigned_profile_id
          and sp.organization_id = new.organization_id
     ) then
    raise exception 'El perfil asignado pertenece a otra organizacion';
  end if;
  return new;
end;
$$;

create trigger endpoints_assert_profile_same_org
  before insert or update on public.endpoints
  for each row execute function public.assert_profile_same_org();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.endpoints enable row level security;

revoke all on public.endpoints from anon;
grant select, update, delete on public.endpoints to authenticated;
-- Sin INSERT para authenticated: dar de alta un endpoint es potestad exclusiva
-- del flujo de provisioning del agente, que corre server-side con service_role
-- tras validar la API key del tenant. Un admin no "crea equipos" a mano.

create policy endpoints_select_same_org
  on public.endpoints
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()));

-- Asignar perfil, poner en cuarentena, renombrar: owner/admin.
create policy endpoints_update_admin
  on public.endpoints
  for update
  to authenticated
  using  (organization_id = (select public.current_org_id()) and (select public.is_org_admin()))
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

-- Dar de baja un equipo (retiro del inventario).
create policy endpoints_delete_admin
  on public.endpoints
  for delete
  to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy endpoints_require_mfa
  on public.endpoints
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));
