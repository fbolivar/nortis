-- =============================================================================
-- Nortis | 04 - security_profiles (perfiles de politica)
-- =============================================================================
-- El perfil es el contrato entre la consola y el agente Go. El agente descarga
-- `config`, lo cachea en disco y lo aplica aunque pierda conectividad.
--
-- Por que jsonb y no columnas tipadas: el conjunto de reglas crece cada fase
-- (Fase 2 USB y carpetas, Fase 3 portapapeles/impresion/web, Fase 4 captura de
-- pantalla). Con columnas, cada regla nueva es una migracion que hay que
-- desplegar coordinada con la version del agente en 200 endpoints. Con jsonb
-- versionado, un agente viejo ignora claves que no conoce y sigue funcionando.
-- El precio es que la validacion del contenido vive en Zod (server-side) y en
-- el check de `schema_version` de abajo, no en el motor de tipos de Postgres.
-- =============================================================================

create table public.security_profiles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name            text not null check (length(btrim(name)) between 2 and 80),
  description     text,

  -- Version del contrato del JSON. El agente compara esto contra la version que
  -- entiende: si el perfil es mas nuevo que el agente, aplica la ultima politica
  -- conocida y reporta un incidente de "agente desactualizado" en vez de aplicar
  -- reglas a medias (degradar con gracia, principio rector del agente).
  schema_version  integer not null default 1 check (schema_version >= 1),

  config          jsonb not null default '{}'::jsonb,

  -- Perfil por defecto del tenant: se asigna a todo endpoint que se registra sin
  -- perfil explicito. Sin esto, un equipo recien instalado quedaria sin politica.
  is_default      boolean not null default false,

  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint security_profiles_config_is_object check (jsonb_typeof(config) = 'object')
);

create index security_profiles_organization_id_idx on public.security_profiles (organization_id);
create unique index security_profiles_name_per_org_idx
  on public.security_profiles (organization_id, lower(name));
create unique index security_profiles_single_default_idx
  on public.security_profiles (organization_id)
  where is_default;

create trigger security_profiles_set_updated_at
  before update on public.security_profiles
  for each row execute function public.set_updated_at();

comment on column public.security_profiles.config is
  'Reglas de politica que consume el agente. Forma esperada (schema_version 1):
   {
     "storage":    { "allowed_paths": [], "blocked_extensions": [] },
     "usb":        { "mode": "allow|read_only|block", "serial_allowlist": [] },
     "web":        { "blocked_domains": [], "allowed_domains": [], "block_webmail": false },
     "clipboard":  { "mode": "allow|alert|block", "protected_sources": [] },
     "printing":   { "mode": "allow|log|block" },
     "encryption": { "confidential_paths": [] },
     "monitoring": { "window_titles": false, "screenshots": false }
   }
   Validado con Zod en el Route Handler antes de persistir.';

-- -----------------------------------------------------------------------------
-- Blindaje del consentimiento sobre el perfil  (requisito A.4 Modulo 3)
-- -----------------------------------------------------------------------------
-- La UI debe bloquear la activacion de titulos de ventana y captura de pantalla
-- cuando falta el consentimiento firmado. Pero "la UI debe bloquear" no es un
-- control de seguridad: es una sugerencia. Este trigger lo convierte en un
-- invariante de la base de datos, y de paso cubre el caso de que el
-- consentimiento se revoque DESPUES de haber creado perfiles con esos modulos
-- activos.
create or replace function public.enforce_monitoring_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consent_at timestamptz;
  v_wants_invasive boolean;
begin
  v_wants_invasive :=
       coalesce((new.config #>> '{monitoring,window_titles}')::boolean, false)
    or coalesce((new.config #>> '{monitoring,screenshots}')::boolean, false);

  if not v_wants_invasive then
    return new;
  end if;

  select o.monitoring_consent_signed_at
    into v_consent_at
    from public.organizations o
   where o.id = new.organization_id;

  if v_consent_at is null then
    raise exception
      'No se puede activar registro de titulos de ventana ni captura de pantalla sin autorizacion de tratamiento de datos firmada (Ley 1581 de 2012). Registre el consentimiento en Administracion > Organizacion.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger security_profiles_enforce_consent
  before insert or update on public.security_profiles
  for each row execute function public.enforce_monitoring_consent();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.security_profiles enable row level security;

revoke all on public.security_profiles from anon;
grant select, insert, update, delete on public.security_profiles to authenticated;

-- Lectura: todo miembro (el viewer necesita ver que politica rige para auditar).
create policy security_profiles_select_same_org
  on public.security_profiles
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()));

-- Escritura: solo owner/admin.
create policy security_profiles_insert_admin
  on public.security_profiles
  for insert
  to authenticated
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy security_profiles_update_admin
  on public.security_profiles
  for update
  to authenticated
  using  (organization_id = (select public.current_org_id()) and (select public.is_org_admin()))
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy security_profiles_delete_admin
  on public.security_profiles
  for delete
  to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy security_profiles_require_mfa
  on public.security_profiles
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));
