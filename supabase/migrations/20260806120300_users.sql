-- =============================================================================
-- Nortis | 03 - users (administradores de consola)
-- =============================================================================
-- Extension de auth.users con los datos de tenant y rol. La identidad
-- (contraseña, factores MFA, sesiones) la sigue gestionando Supabase Auth: aqui
-- solo vive la autorizacion.
--
-- Un usuario pertenece a UNA organizacion (YAGNI). Si a futuro se necesita que
-- un MSP administre varios tenants, esto se convierte en tabla puente
-- organization_members y current_org_id() pasa a leer el tenant activo del JWT;
-- por eso ninguna politica RLS del resto del esquema consulta public.users
-- directamente, solo a traves de los helpers.
-- =============================================================================

create table public.users (
  -- Mismo id que auth.users: la fila muere con la cuenta.
  id              uuid primary key references auth.users(id) on delete cascade,

  organization_id uuid not null references public.organizations(id) on delete cascade,

  email           text not null,
  full_name       text,
  role            public.app_role not null default 'viewer',

  -- Espejo del estado real de enrolamiento en auth.mfa_factors. Es cache para
  -- poder mostrar "3 de 5 admins sin MFA" en la pagina de cumplimiento sin
  -- consultar el esquema auth. NO es la fuente de verdad del control de acceso:
  -- quien decide es el claim `aal` del JWT via public.mfa_satisfied().
  mfa_enabled     boolean not null default false,

  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index users_organization_id_idx on public.users (organization_id);
create unique index users_email_per_org_idx on public.users (organization_id, lower(email));

-- Exactamente un owner por organizacion: evita el estado ambiguo de "nadie
-- puede transferir la propiedad" o "dos dueños se pisan el plan".
create unique index users_single_owner_per_org_idx
  on public.users (organization_id)
  where role = 'owner';

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Reglas de escritura que RLS no puede expresar
-- -----------------------------------------------------------------------------
-- RLS decide QUE FILAS se pueden tocar, no QUE COLUMNAS. Sin esto, un viewer
-- con permiso de editar su propio perfil podria hacer `update users set
-- role = 'owner' where id = auth.uid()` y escalar privilegios. Este trigger es
-- el que impide la escalada.
create or replace function public.enforce_user_update_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.app_role := public.current_app_role();
begin
  -- service_role (Route Handlers, invitaciones, jobs) no tiene fila en
  -- public.users: current_app_role() devuelve NULL y se le deja pasar.
  if v_actor_role is null then
    return new;
  end if;

  -- Nadie cambia de tenant. Nunca.
  if new.organization_id is distinct from old.organization_id then
    raise exception 'No se puede reasignar un usuario a otra organizacion';
  end if;

  if new.role is distinct from old.role then
    -- Solo el owner reparte roles.
    if v_actor_role <> 'owner' then
      raise exception 'Solo el owner puede modificar roles';
    end if;

    -- El owner no puede auto-degradarse: dejaria el tenant sin nadie capaz de
    -- gestionar API keys ni consentimiento. Transferir propiedad es un flujo
    -- explicito (promover al nuevo owner, que degrada al anterior).
    if old.role = 'owner' and old.id = (select auth.uid()) then
      raise exception 'El owner no puede degradarse a si mismo; transfiera la propiedad primero';
    end if;
  end if;

  return new;
end;
$$;

create trigger users_enforce_update_rules
  before update on public.users
  for each row execute function public.enforce_user_update_rules();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;

revoke all on public.users from anon;
grant select, update on public.users to authenticated;
-- Sin INSERT: se entra al tenant por bootstrap (owner) o por invitacion
-- procesada server-side con service_role. Sin DELETE: se borra la cuenta en
-- auth.users y el ON DELETE CASCADE limpia esta fila.

create policy users_select_same_org
  on public.users
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()));

-- Cada quien edita su propio perfil (nombre, etc.). Las columnas sensibles ya
-- estan protegidas por el trigger de arriba.
create policy users_update_self
  on public.users
  for update
  to authenticated
  using  (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- El owner administra a los demas miembros de su organizacion.
create policy users_update_by_owner
  on public.users
  for update
  to authenticated
  using  (organization_id = (select public.current_org_id()) and (select public.is_org_owner()))
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_owner()));

-- MFA: excepcion deliberada para la PROPIA fila.
--
-- Un admin recien invitado llega en aal1 y todavia no tiene factor enrolado. Si
-- la restriccion de MFA le bloqueara tambien su propia fila, la consola no
-- podria ni resolver quien es, y quedaria en un deadlock: no puede entrar
-- porque no tiene MFA, y no puede enrolar MFA porque no puede entrar.
-- Leer la fila propia no expone datos de nadie mas, asi que la excepcion no
-- abre superficie: el resto del esquema sigue exigiendo aal2.
create policy users_require_mfa
  on public.users
  as restrictive
  for all
  to authenticated
  using (id = (select auth.uid()) or (select public.mfa_satisfied()))
  with check (id = (select auth.uid()) or (select public.mfa_satisfied()));

-- -----------------------------------------------------------------------------
-- Alta de tenant
-- -----------------------------------------------------------------------------
-- Unico camino para crear una organizacion. SECURITY DEFINER porque tiene que
-- escribir en dos tablas donde el usuario recien registrado aun no tiene
-- ninguna fila (y por tanto ningun permiso RLS): es el problema del huevo y la
-- gallina del onboarding multi-tenant.
--
-- Es idempotente-seguro: si el usuario ya pertenece a una organizacion, falla
-- en vez de crear una segunda.
create or replace function public.bootstrap_organization(
  p_org_name  text,
  p_org_slug  text,
  p_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email   text;
  v_org_id  uuid;
begin
  if v_user_id is null then
    raise exception 'Se requiere sesion autenticada';
  end if;

  if exists (select 1 from public.users u where u.id = v_user_id) then
    raise exception 'El usuario ya pertenece a una organizacion';
  end if;

  select au.email into v_email from auth.users au where au.id = v_user_id;

  insert into public.organizations (name, slug)
  values (btrim(p_org_name), lower(btrim(p_org_slug)))
  returning id into v_org_id;

  insert into public.users (id, organization_id, email, full_name, role)
  values (v_user_id, v_org_id, v_email, nullif(btrim(coalesce(p_full_name, '')), ''), 'owner');

  return v_org_id;
end;
$$;

revoke execute on function public.bootstrap_organization(text, text, text) from public, anon;
grant   execute on function public.bootstrap_organization(text, text, text) to authenticated;
