-- =============================================================================
-- Nortis | Tests de aislamiento multi-tenant y control de acceso  (A.6.1)
-- =============================================================================
-- Ejecutar con:  supabase test db
--
-- Estos tests no son opcionales ni "nice to have". El fallo de seguridad mas
-- probable en un SaaS multi-tenant no es un 0-day: es una politica RLS que
-- alguien olvido al agregar una tabla. Esta suite convierte ese olvido en un
-- build rojo.
--
-- ESTADO: en ejecucion automatica desde el 2026-08-07. La corre el job
-- `contrato` de .github/workflows/ci.yml contra un Supabase local y efimero.
--
-- La primera ejecucion real destapo que el helper `tests.impersonate` no era
-- alcanzable tras la primera llamada, y que por tanto SEIS de las diecisiete
-- comprobaciones nunca se habian evaluado. Es exactamente el motivo por el que
-- una suite que no corre no vale nada: parecia completa.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
create schema if not exists tests;

select plan(17);

-- -----------------------------------------------------------------------------
-- Fixture: dos tenants completamente separados
-- -----------------------------------------------------------------------------
-- Se insertan como superusuario (antes de cambiar de rol), por eso saltan RLS.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner-a@acme.test',   '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'viewer-a@acme.test',  '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'owner-b@globex.test', '', now(), now());

insert into public.organizations (id, name, slug)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SAS',  'acme'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Globex SAS', 'globex');

insert into public.users (id, organization_id, email, role)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-a@acme.test',   'owner'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer-a@acme.test',  'viewer'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner-b@globex.test', 'owner');

insert into public.security_profiles (id, organization_id, name)
values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Oficina Bogota'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Campo');

insert into public.endpoints (id, organization_id, hostname, machine_fingerprint)
values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ACME-PC-01',   'fp-acme-01'),
  ('b1000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'GLOBEX-PC-01', 'fp-globex-01');

insert into public.activity_events (organization_id, endpoint_id, event_type, occurred_at, payload)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-00000000000a', 'file_created', now(), '{"path":"C:\\acme\\secreto.docx"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-00000000000b', 'file_created', now(), '{"path":"C:\\globex\\secreto.docx"}');

insert into public.dlp_incidents (organization_id, endpoint_id, rule_triggered, severity)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-00000000000a', 'usb.blocked', 'high'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-00000000000b', 'usb.blocked', 'high');

-- Helper: se hace pasar por un usuario con un nivel de MFA dado.
create or replace function tests.impersonate(p_user uuid, p_aal text default 'aal2')
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

-- El helper se llama VARIAS veces a lo largo de la suite, y a partir de la
-- primera el rol de sesion ya es `authenticated`, que no tiene USAGE sobre el
-- esquema `tests`. Sin estos grants la segunda llamada muere con
-- "permission denied for schema tests" y pgTAP aborta con "Bad plan: you
-- planned 17 tests but ran 11" — un mensaje que apunta al plan y no al permiso,
-- que es lo que costo encontrar la primera vez que esta suite llego a correr.
grant usage on schema tests to public;
grant execute on function tests.impersonate(uuid, text) to public;

-- =============================================================================
-- 1. Aislamiento de lectura entre tenants
-- =============================================================================
select tests.impersonate('11111111-1111-1111-1111-111111111111');  -- owner de Acme

select is(
  (select count(*) from public.organizations)::int, 1,
  'organizations: el owner de Acme ve exactamente 1 organizacion (la suya)'
);

select is(
  (select name from public.organizations), 'Acme SAS',
  'organizations: y esa organizacion es Acme, no Globex'
);

select is(
  (select count(*) from public.endpoints where organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 0,
  'endpoints: Acme no puede leer equipos de Globex ni pidiendolos explicitamente'
);

select is(
  (select count(*) from public.activity_events)::int, 1,
  'activity_events: solo la telemetria del propio tenant'
);

select is(
  (select count(*) from public.dlp_incidents)::int, 1,
  'dlp_incidents: solo los incidentes del propio tenant'
);

select is(
  (select count(*) from public.security_profiles)::int, 1,
  'security_profiles: solo las politicas del propio tenant'
);

select is(
  (select count(*) from public.users)::int, 2,
  'users: se ven los miembros de la propia organizacion y ninguno mas'
);

-- =============================================================================
-- 2. Aislamiento de ESCRITURA (el mas olvidado)
-- =============================================================================
-- Leer datos ajenos es grave; escribirlos es peor. Un USING que filtra bien
-- pero un WITH CHECK ausente permite inyectar filas en el tenant vecino.
select throws_ok(
  $$ insert into public.security_profiles (organization_id, name)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Perfil inyectado') $$,
  '42501',
  null,
  'security_profiles: Acme no puede insertar una politica dentro de Globex'
);

-- El UPDATE cruzado no lanza error: RLS simplemente no encuentra la fila.
-- Por eso se verifica el efecto, no la excepcion.
update public.security_profiles set name = 'Secuestrado'
 where id = 'b0000000-0000-0000-0000-00000000000b';

select is(
  (select count(*) from public.security_profiles where name = 'Secuestrado')::int, 0,
  'security_profiles: un UPDATE cruzado no afecta ninguna fila de Globex'
);

-- =============================================================================
-- 3. Telemetria: solo lectura incluso para el owner  (valor forense)
-- =============================================================================
select throws_ok(
  $$ delete from public.activity_events $$,
  '42501',
  null,
  'activity_events: ni el owner puede borrar evidencia forense'
);

-- =============================================================================
-- 4. audit_log inmutable
-- =============================================================================
select throws_ok(
  $$ update public.audit_log set action = 'manipulado' $$,
  null,
  null,
  'audit_log: UPDATE rechazado (append-only)'
);

-- =============================================================================
-- 5. Separacion de roles: viewer es solo lectura
-- =============================================================================
select tests.impersonate('22222222-2222-2222-2222-222222222222');  -- viewer de Acme

update public.security_profiles set name = 'Editado por viewer'
 where id = 'a0000000-0000-0000-0000-00000000000a';

select is(
  (select count(*) from public.security_profiles where name = 'Editado por viewer')::int, 0,
  'security_profiles: un viewer no puede modificar politicas de su propia organizacion'
);

-- =============================================================================
-- 6. MFA obligatorio para owner/admin  (A.6.2)
-- =============================================================================
select tests.impersonate('11111111-1111-1111-1111-111111111111', 'aal1');  -- owner SIN MFA

select is(
  (select count(*) from public.endpoints)::int, 0,
  'MFA: un owner en aal1 no accede a datos del tenant'
);

-- Pero si puede leer su propia fila, o quedaria en deadlock sin poder enrolar
-- el segundo factor.
select is(
  (select count(*) from public.users where id = '11111111-1111-1111-1111-111111111111')::int, 1,
  'MFA: un owner en aal1 conserva acceso a su propia fila para poder enrolar MFA'
);

-- =============================================================================
-- 7. Particiones de activity_events  (regresion de un fallo real)
-- =============================================================================
-- PostgREST expone cada particion como tabla independiente del esquema public.
-- La version inicial del esquema solo tenia RLS en la tabla padre, asi que
-- /rest/v1/activity_events_2026_08 devolvia telemetria de todos los tenants.
-- Estos tests existen para que ese fallo no pueda volver.
select tests.impersonate('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*) from public.activity_events)::int, 1,
  'particiones: la lectura via la tabla padre sigue aplicando RLS'
);

select throws_ok(
  format('select count(*) from public.%I', 'activity_events_' || to_char(now(), 'YYYY_MM')),
  '42501',
  null,
  'particiones: el acceso directo a la particion del mes esta denegado'
);

reset role;

select is(
  (select count(*)::int
     from pg_class c
     join pg_inherits i on i.inhrelid = c.oid
     join pg_class par on par.oid = i.inhparent
    where par.relname = 'activity_events' and c.relrowsecurity = false),
  0,
  'particiones: ninguna particion existente tiene RLS deshabilitado'
);

select ok(
  (select c.relrowsecurity
     from pg_class c
    where c.relname = public.create_activity_events_partition((now() + interval '13 months')::date)),
  'particiones: una particion recien creada nace con RLS habilitado'
);

select * from finish();

rollback;
