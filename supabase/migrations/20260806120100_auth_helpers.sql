-- =============================================================================
-- Nortis | 01 - Helpers de autorizacion (base de TODA politica RLS)
-- =============================================================================
-- DECISION CRITICA: estas funciones son SECURITY DEFINER a proposito.
--
-- Si `public.current_org_id()` se ejecutara con los permisos del usuario, la
-- politica RLS de public.users tendria que leer public.users para evaluarse,
-- lo que produce recursion infinita (error 42P17). SECURITY DEFINER hace que
-- la lectura interna omita RLS y corte la recursion.
--
-- Contramedidas obligatorias por ser SECURITY DEFINER:
--   1. `set search_path = ''` -> nadie puede secuestrar la resolucion de nombres
--      creando un objeto homonimo en un esquema propio. Por eso TODO nombre va
--      calificado con esquema en el cuerpo.
--   2. Ninguna funcion recibe parametros que decidan de que usuario se habla:
--      siempre se derivan de auth.uid(). No hay forma de pedir "dame el rol de
--      otro" — la superficie de abuso es cero.
--   3. Se revoca EXECUTE a anon: un visitante no autenticado no debe poder
--      sondear la existencia de organizaciones.
--
-- Son STABLE (no VOLATILE) para que el planner las evalue una vez por query en
-- lugar de una vez por fila. En las politicas se envuelven en (select ...) para
-- forzar el mismo cacheo (initplan) tambien dentro del filtro RLS.
--
-- Se escriben en plpgsql (no sql) porque el cuerpo de una funcion plpgsql no se
-- valida contra el catalogo al crearla: eso permite referenciar public.users
-- antes de que exista la tabla, y mantener el orden "helpers primero".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Organizacion del usuario autenticado
-- -----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  select u.organization_id
    into v_org_id
    from public.users u
   where u.id = (select auth.uid());

  return v_org_id;
end;
$$;

comment on function public.current_org_id() is
  'Organizacion del usuario autenticado. SECURITY DEFINER para evitar recursion en las politicas RLS de public.users.';

-- -----------------------------------------------------------------------------
-- Rol del usuario autenticado
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  select u.role
    into v_role
    from public.users u
   where u.id = (select auth.uid());

  return v_role;
end;
$$;

-- NOTA: se llama current_app_role() y no current_role() porque CURRENT_ROLE es
-- palabra reservada de SQL y colisionaria en cualquier expresion.

-- -----------------------------------------------------------------------------
-- Predicados de rol
-- -----------------------------------------------------------------------------
create or replace function public.is_org_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.current_app_role() in ('owner', 'admin');
end;
$$;

create or replace function public.is_org_owner()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.current_app_role() = 'owner';
end;
$$;

-- -----------------------------------------------------------------------------
-- MFA obligatorio para owner/admin  (requisito A.6.2)
-- -----------------------------------------------------------------------------
-- Supabase expone el nivel de autenticacion alcanzado en el claim `aal` del JWT:
--   aal1 = solo contraseña / OAuth
--   aal2 = ademas supero un segundo factor en esta sesion
--
-- Se enforza en la BASE DE DATOS y no solo en middleware de Next.js: si mañana
-- se filtra la anon key y alguien golpea PostgREST directo, el middleware no
-- existe pero esta politica si. La seguridad del producto no puede depender de
-- que la UI se comporte bien.
--
-- viewer queda en aal1 a proposito: es un rol de solo lectura (auditor externo,
-- contador) y exigirle MFA sin poder forzarle enrolamiento lo dejaria fuera.
-- Si el negocio decide endurecerlo, es cambiar el `else true` por `false`.
create or replace function public.mfa_satisfied()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_aal  text;
begin
  v_role := public.current_app_role();

  -- Usuario autenticado que aun no tiene fila en public.users (esta a medio
  -- aprovisionar): no se le concede nada por esta via; las politicas
  -- permisivas de cada tabla ya lo filtran por organization_id nulo.
  if v_role is null then
    return true;
  end if;

  if v_role in ('owner', 'admin') then
    v_aal := coalesce((select auth.jwt() ->> 'aal'), 'aal1');
    return v_aal = 'aal2';
  end if;

  return true;
end;
$$;

comment on function public.mfa_satisfied() is
  'TRUE si el usuario cumple el nivel de MFA exigido por su rol. Se aplica como politica RESTRICTIVE en cada tabla del tenant.';

-- -----------------------------------------------------------------------------
-- Permisos de ejecucion
-- -----------------------------------------------------------------------------
revoke execute on function public.current_org_id()   from public, anon;
revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_org_admin()     from public, anon;
revoke execute on function public.is_org_owner()     from public, anon;
revoke execute on function public.mfa_satisfied()    from public, anon;

grant execute on function public.current_org_id()   to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_org_admin()     to authenticated;
grant execute on function public.is_org_owner()     to authenticated;
grant execute on function public.mfa_satisfied()    to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger generico de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
