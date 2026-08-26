-- =============================================================================
-- Nortis | Sedes (Fase 1: modelo + organizacion)
-- =============================================================================
-- Primer paso hacia las consolas delegadas: agrupar equipos por sede. Esta fase
-- es PURAMENTE organizativa — no cambia RLS ni restringe a nadie todavia. El
-- limite de la consola delegada (RLS por sede + users.site_id) llega en la Fase 2;
-- aqui solo se crea la estructura para poder asignar equipos a sedes y, luego,
-- delegar y sacar estadisticas por sede.

create table public.sites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now()
);

-- Nombre unico por organizacion (sin distinguir mayusculas): "Bogota" y "bogota"
-- son la misma sede para un humano.
create unique index sites_org_name_uniq on public.sites (organization_id, lower(name));

alter table public.sites enable row level security;

-- Lectura para los miembros del tenant; escritura solo para admin de la
-- organizacion (crear/renombrar/borrar sedes es gestion central).
drop policy if exists "sites_read" on public.sites;
create policy "sites_read" on public.sites for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy if exists "sites_write" on public.sites;
create policy "sites_write" on public.sites for all to authenticated
  using (organization_id = (select public.current_org_id()) and public.is_org_admin())
  with check (organization_id = (select public.current_org_id()) and public.is_org_admin());

-- Cada equipo pertenece a una sede (null = sin asignar). ON DELETE SET NULL: al
-- borrar una sede sus equipos quedan sin sede, no se borran.
alter table public.endpoints
  add column if not exists site_id uuid references public.sites(id) on delete set null;

create index if not exists endpoints_site_idx on public.endpoints (site_id);

-- endpoints usa permisos POR COLUMNA (para ocultar agent_credential_hash a
-- authenticated). Una columna nueva no hereda ningun grant, asi que hay que
-- concederla explicitamente o el `select site_id` falla con permiso denegado.
grant select (site_id), update (site_id) on public.endpoints to authenticated;
