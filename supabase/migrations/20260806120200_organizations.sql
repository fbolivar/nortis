-- =============================================================================
-- Nortis | 02 - organizations (tenants)
-- =============================================================================
-- Raiz del arbol multi-tenant. Toda tabla con datos de cliente cuelga de aqui
-- por organization_id, y toda politica RLS compara contra current_org_id().
-- =============================================================================

create table public.organizations (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null check (length(btrim(name)) between 2 and 120),

  -- Identificador legible para URLs y para el provisioning del agente.
  slug                        text not null unique
                                check (slug ~ '^[a-z0-9]([a-z0-9-]{1,60})[a-z0-9]$'),

  plan_tier                   public.plan_tier not null default 'trial',

  -- ---------------------------------------------------------------------------
  -- CONSENTIMIENTO DE MONITOREO  (requisito A.4 Modulo 3 / Ley 1581 de 2012)
  -- ---------------------------------------------------------------------------
  -- Captura de pantalla y registro de titulos de ventana son tratamiento de
  -- datos personales del trabajador. Sin autorizacion previa y expresa
  -- documentada, activarlos expone al CLIENTE a sancion de la SIC y a Nortis a
  -- responsabilidad como encargado del tratamiento.
  --
  -- Este campo es el interruptor legal, y vive en la BD (no en un feature flag
  -- de aplicacion) porque debe ser inviolable desde la UI y auditable: la misma
  -- fila que autoriza el modulo es la evidencia de cuando y quien lo autorizo.
  -- El agente Go tambien lo consulta antes de activar esos recolectores.
  monitoring_consent_signed_at timestamptz,
  monitoring_consent_signed_by text,          -- nombre/cargo del representante legal
  monitoring_consent_document  text,          -- ruta en Storage del documento firmado

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- No se puede registrar quien firmo sin registrar cuando, ni al reves.
  constraint organizations_consent_complete check (
    (monitoring_consent_signed_at is null     and monitoring_consent_signed_by is null)
    or
    (monitoring_consent_signed_at is not null and monitoring_consent_signed_by is not null)
  )
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

comment on column public.organizations.monitoring_consent_signed_at is
  'Fecha de la autorizacion firmada de tratamiento de datos. NULL bloquea captura de pantalla y titulos de ventana (Ley 1581/2012).';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;

revoke all on public.organizations from anon;
grant select, update on public.organizations to authenticated;
-- Sin GRANT de INSERT/DELETE: crear un tenant pasa solo por
-- public.bootstrap_organization() (migracion 03). Borrar un tenant es una
-- operacion de soporte, no de autoservicio.

-- Lectura: cualquier miembro ve su propia organizacion.
create policy organizations_select_own
  on public.organizations
  for select
  to authenticated
  using (id = (select public.current_org_id()));

-- Escritura: solo owner. Cambiar plan_tier o el consentimiento de monitoreo son
-- decisiones contractuales/legales, no operativas.
create policy organizations_update_owner
  on public.organizations
  for update
  to authenticated
  using  (id = (select public.current_org_id()) and (select public.is_org_owner()))
  with check (id = (select public.current_org_id()) and (select public.is_org_owner()));

-- MFA: politica RESTRICTIVE -> se combina con AND sobre las permisivas de arriba.
create policy organizations_require_mfa
  on public.organizations
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

-- -----------------------------------------------------------------------------
-- Blindaje del consentimiento
-- -----------------------------------------------------------------------------
-- Revocar el consentimiento debe ser posible (el titular puede revocarlo), pero
-- NUNCA de forma silenciosa: el registro pasa al audit_log inmutable. El trigger
-- se crea en la migracion de audit_log, que es donde vive la tabla destino.
create or replace function public.assert_consent_change_is_deliberate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No se permite "corregir" una fecha de consentimiento hacia atras ni hacia
  -- el futuro: o se firma (se setea con now()) o se revoca (se pone NULL).
  if new.monitoring_consent_signed_at is not null
     and new.monitoring_consent_signed_at is distinct from old.monitoring_consent_signed_at
     and new.monitoring_consent_signed_at > now() then
    raise exception 'La fecha de consentimiento no puede ser futura';
  end if;

  return new;
end;
$$;

create trigger organizations_guard_consent
  before update on public.organizations
  for each row execute function public.assert_consent_change_is_deliberate();
