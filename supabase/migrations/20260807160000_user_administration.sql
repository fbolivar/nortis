-- =============================================================================
-- Nortis | 13 - Administracion de usuarios de consola
-- =============================================================================
-- Da al administrador el ciclo completo sobre las cuentas de su organizacion:
-- crear, editar, cambiar contraseña y eliminar. Sustituye al flujo de
-- invitaciones, que queda retirado al final de este archivo.
--
-- POR QUE ESTAS FUNCIONES ESCRIBEN EN auth.users
--
-- Crear una cuenta, borrarla o cambiarle la contraseña son operaciones sobre el
-- esquema `auth`, que pertenece a GoTrue. La via oficial es la Admin API, que
-- exige la `service_role` key. Esa key salta RLS por completo: meterla en la
-- consola significa que, a partir de ahi, la base deja de ser quien decide y
-- toda la autorizacion pasa a depender de que el codigo TypeScript no tenga un
-- fallo. En un producto cuyo argumento de venta es el control de acceso, es el
-- tipo de concesion que no se recupera.
--
-- La alternativa es esta: SECURITY DEFINER, con las mismas comprobaciones que el
-- resto del esquema (`is_org_admin()`, `mfa_satisfied()`, pertenencia al tenant)
-- y sin ninguna credencial nueva que custodiar.
--
-- EL PRECIO, dicho sin adornos: esto acopla Nortis a la estructura interna de
-- auth.users, que es de GoTrue y puede cambiar entre versiones de la plataforma.
-- El acoplamiento esta CONCENTRADO en `admin_create_user` —las otras tres solo
-- tocan columnas estables (`encrypted_password`, y el borrado por PK)— y esta
-- documentado en el cuerpo de la funcion. Si una actualizacion de Supabase lo
-- rompe, el sintoma sera un alta que falla, no una brecha de seguridad.
--
-- NOTA SOBRE auth.uid() DENTRO DE SECURITY DEFINER
--
-- SECURITY DEFINER cambia el ROL con el que se ejecuta el cuerpo, no los claims
-- del JWT: `auth.uid()` sigue devolviendo el usuario real que llamo. Por eso el
-- trigger de auditoria registra al administrador de verdad y no a `postgres`.
--
-- Y por eso mismo TODA regla de autorizacion se comprueba explicitamente aqui:
-- ejecutandose como `postgres` (superusuario) ni RLS ni el trigger
-- `enforce_user_update_rules` intervienen. Dentro de estas funciones no hay red
-- de seguridad debajo — las comprobaciones de abajo SON el control de acceso.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Politica de contraseñas
-- -----------------------------------------------------------------------------
-- Replica exacta de `signUpSchema` en src/features/auth/types/schemas.ts. Vive
-- tambien aqui porque la validacion del cliente es una cortesia de UX: quien
-- llame al RPC directamente desde PostgREST se salta el formulario entero.
create or replace function public.assert_password_strength(p_password text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_password is null or length(p_password) < 12 then
    raise exception 'La contraseña debe tener al menos 12 caracteres';
  end if;

  if p_password !~ '[a-z]' or p_password !~ '[A-Z]' or p_password !~ '[0-9]' then
    raise exception 'La contraseña debe incluir minuscula, mayuscula y numero';
  end if;
end;
$$;

comment on function public.assert_password_strength(text) is
  'Politica de contraseñas de consola. Espejo de signUpSchema; la validacion del cliente no es suficiente porque el RPC es alcanzable directamente.';

-- -----------------------------------------------------------------------------
-- Guardia comun de las cuatro operaciones
-- -----------------------------------------------------------------------------
-- Devuelve el rol del usuario objetivo tras comprobar que quien llama puede
-- administrarlo. Centralizada porque una regla de escalada de privilegios
-- repetida cuatro veces es una regla que acabara divergiendo en tres sitios.
--
-- `p_target_id` NULL = alta de una cuenta nueva (todavia no hay objetivo).
create or replace function public.assert_can_administer_user(p_target_id uuid)
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id   uuid := (select auth.uid());
  v_actor_role public.app_role;
  v_target     record;
begin
  if v_actor_id is null then
    raise exception 'Se requiere sesion autenticada';
  end if;

  v_actor_role := public.current_app_role();

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede gestionar usuarios';
  end if;

  -- Un admin en aal1 no puede administrar cuentas. Sin esta linea, la unica
  -- superficie del producto que sortearia el requisito de MFA seria justamente
  -- la que reparte privilegios.
  if not public.mfa_satisfied() then
    raise exception 'Complete el segundo factor antes de gestionar usuarios';
  end if;

  if p_target_id is null then
    return null;
  end if;

  select u.id, u.role, u.organization_id
    into v_target
    from public.users u
   where u.id = p_target_id;

  -- Mismo mensaje para "no existe" y "es de otro tenant": distinguirlos
  -- convertiria esta funcion en un detector de cuentas ajenas.
  if v_target.id is null or v_target.organization_id is distinct from public.current_org_id() then
    raise exception 'El usuario no existe en esta organizacion';
  end if;

  -- Un admin no puede tocar a otro admin ni al owner: si pudiera, el rol admin
  -- seria en la practica equivalente a owner (bastaria degradar al resto).
  -- Repartir poder sobre quien reparte poder es competencia exclusiva del owner.
  if v_target.role in ('owner', 'admin') and v_actor_role <> 'owner' then
    raise exception 'Solo el propietario puede administrar a otros administradores';
  end if;

  return v_target.role;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta directa
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_user(
  p_email     text,
  p_password  text,
  p_full_name text default null,
  p_role      public.app_role default 'viewer'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.app_role;
  v_user_id    uuid := extensions.gen_random_uuid();
  v_org_id     uuid;
  v_email      text := lower(btrim(p_email));
  v_full_name  text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  perform public.assert_can_administer_user(null);

  v_actor_role := public.current_app_role();
  v_org_id     := public.current_org_id();

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Correo no valido';
  end if;

  -- El owner es unico por organizacion (indice users_single_owner_per_org_idx) y
  -- la propiedad se transfiere, no se reparte: dejar crearlo aqui solo produciria
  -- un error de indice ilegible tres pasos mas adelante.
  if p_role = 'owner' then
    raise exception 'No se puede crear un propietario; transfiera la propiedad desde la cuenta actual';
  end if;

  if p_role = 'admin' and v_actor_role <> 'owner' then
    raise exception 'Solo el propietario puede crear administradores';
  end if;

  perform public.assert_password_strength(p_password);

  -- auth.users es global, no por tenant: el correo puede estar ocupado por una
  -- cuenta de OTRA organizacion. Se comprueba antes para dar un mensaje util en
  -- vez de una violacion de unicidad.
  if exists (select 1 from auth.users au where lower(au.email) = v_email) then
    raise exception 'Ya existe una cuenta con ese correo';
  end if;

  -- =========================================================================
  -- AQUI VIVE TODO EL ACOPLAMIENTO CON GoTrue. Si una version futura de
  -- Supabase rompe el alta de usuarios, es este INSERT y no otro.
  --
  -- Las ocho columnas de token van a '' y NO se dejan en NULL aunque la tabla
  -- las admita: GoTrue las lee en Go como `string`, y un NULL aborta el login
  -- con "converting NULL to string is unsupported" ANTES de comprobar la
  -- contraseña. El sintoma es "credenciales invalidas" con la contraseña
  -- correcta, que manda a depurar justo al sitio equivocado.
  -- =========================================================================
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change, phone_change_token,
    reauthentication_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    case when v_full_name is null then '{}'::jsonb
         else jsonb_build_object('full_name', v_full_name) end,
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  -- La identidad `email` es lo que permite despues enlazar la misma cuenta con
  -- un proveedor OAuth sin duplicarla.
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at
  )
  values (
    extensions.gen_random_uuid(), v_user_id, 'email', v_user_id::text,
    jsonb_build_object(
      'sub', v_user_id::text, 'email', v_email,
      'email_verified', true, 'phone_verified', false
    ),
    now(), now(), null
  );

  insert into public.users (id, organization_id, email, full_name, role)
  values (v_user_id, v_org_id, v_email, v_full_name, p_role);

  return v_user_id;
end;
$$;

comment on function public.admin_create_user(text, text, text, public.app_role) is
  'Crea una cuenta de consola en la organizacion del administrador que llama. Unico punto del esquema que inserta en auth.users.';

-- -----------------------------------------------------------------------------
-- Edicion de perfil y rol
-- -----------------------------------------------------------------------------
-- Existe como RPC en vez de apoyarse en las politicas de UPDATE de public.users
-- porque aquellas solo permiten al owner tocar filas ajenas: un admin no puede
-- corregir el nombre de un viewer. Aqui la regla es una sola y explicita.
create or replace function public.admin_update_user(
  p_user_id   uuid,
  p_full_name text default null,
  p_role      public.app_role default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id   uuid := (select auth.uid());
  v_actor_role public.app_role;
  v_target_role public.app_role;
begin
  v_target_role := public.assert_can_administer_user(p_user_id);
  v_actor_role  := public.current_app_role();

  if p_role is not null and p_role is distinct from v_target_role then
    if v_actor_role <> 'owner' then
      raise exception 'Solo el propietario puede modificar roles';
    end if;

    -- Misma regla que enforce_user_update_rules, repetida a proposito: ese
    -- trigger no se dispara aqui (el cuerpo corre como postgres), asi que sin
    -- esta linea el owner podria degradarse y dejar el tenant sin dueño.
    if v_target_role = 'owner' and p_user_id = v_actor_id then
      raise exception 'El propietario no puede degradarse a si mismo; transfiera la propiedad primero';
    end if;

    if p_role = 'owner' then
      raise exception 'La propiedad se transfiere desde la cuenta del propietario actual';
    end if;
  end if;

  update public.users
     set full_name = case
           -- '' significa "borrar el nombre"; NULL significa "no tocar".
           when p_full_name is null then full_name
           else nullif(btrim(p_full_name), '')
         end,
         role = coalesce(p_role, role)
   where id = p_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cambio de contraseña de otra cuenta
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_user_password(
  p_user_id  uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_email    text;
begin
  perform public.assert_can_administer_user(p_user_id);
  perform public.assert_password_strength(p_password);

  -- La cuenta propia se cambia con supabase.auth.updateUser() desde el cliente,
  -- que exige sesion viva y respeta la politica de GoTrue. Desviar el cambio
  -- propio por aqui saltaria esa comprobacion sin ganar nada.
  if p_user_id = v_actor_id then
    raise exception 'Para cambiar su propia contraseña use la opcion de su perfil';
  end if;

  select u.email into v_email from public.users u where u.id = p_user_id;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at         = now()
   where id = p_user_id;

  -- Se cierran las sesiones abiertas. Una contraseña que se cambia porque pudo
  -- quedar comprometida no sirve de nada si el token que ya tenia el atacante
  -- sigue siendo valido: los refresh_token cuelgan de la sesion y caen con ella.
  delete from auth.sessions where user_id = p_user_id;

  -- auth.users no tiene trigger de auditoria (es esquema de GoTrue), asi que el
  -- registro se escribe a mano. NUNCA la contraseña, ni su hash: el log de
  -- auditoria lo leen todos los administradores.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_email, action,
    target_table, target_id, before_state, after_state
  )
  values (
    public.current_org_id(),
    v_actor_id,
    (select u.email from public.users u where u.id = v_actor_id),
    'user.password_reset',
    'users',
    p_user_id::text,
    null,
    jsonb_build_object('email', v_email, 'sessions_revoked', true)
  );
end;
$$;

comment on function public.admin_set_user_password(uuid, text) is
  'Asigna una contraseña nueva a otra cuenta del tenant y cierra sus sesiones. No registra la contraseña en el log de auditoria.';

-- -----------------------------------------------------------------------------
-- Eliminacion
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id    uuid := (select auth.uid());
  v_target_role public.app_role;
begin
  v_target_role := public.assert_can_administer_user(p_user_id);

  if p_user_id = v_actor_id then
    raise exception 'No puede eliminar su propia cuenta';
  end if;

  if v_target_role = 'owner' then
    raise exception 'No se puede eliminar al propietario; transfiera la propiedad primero';
  end if;

  -- Se borra de auth.users y el ON DELETE CASCADE de public.users.id limpia el
  -- perfil, los factores MFA y las sesiones. Borrar primero public.users dejaria
  -- una cuenta capaz de autenticarse pero sin tenant: entraria y se quedaria
  -- atrapada en /onboarding, con derecho a crear una organizacion nueva.
  --
  -- El historial NO se pierde: audit_log.actor_user_id es ON DELETE SET NULL y
  -- conserva `actor_email`, asi que lo que hizo esta persona sigue siendo
  -- atribuible despues de eliminarla.
  delete from auth.users where id = p_user_id;
end;
$$;

comment on function public.admin_delete_user(uuid) is
  'Elimina una cuenta de consola. El rastro en audit_log sobrevive por diseño (actor_user_id ON DELETE SET NULL + actor_email).';

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
-- `anon` no aparece en ninguna: son operaciones de administracion y un visitante
-- sin sesion no debe poder ni sondear su existencia.
-- Las dos auxiliares se revocan tambien a `authenticated`: son detalle de
-- implementacion de las cuatro RPC de abajo, no operaciones. Expuesta sola,
-- assert_can_administer_user permite sondear que cuentas existen en la
-- organizacion por la diferencia entre sus mensajes de error.
revoke execute on function public.assert_password_strength(text)     from public, anon, authenticated;
revoke execute on function public.assert_can_administer_user(uuid)   from public, anon, authenticated;
revoke execute on function public.admin_create_user(text, text, text, public.app_role) from public, anon;
revoke execute on function public.admin_update_user(uuid, text, public.app_role)       from public, anon;
revoke execute on function public.admin_set_user_password(uuid, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid)             from public, anon;

grant execute on function public.admin_create_user(text, text, text, public.app_role) to authenticated;
grant execute on function public.admin_update_user(uuid, text, public.app_role)       to authenticated;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid)             to authenticated;

-- -----------------------------------------------------------------------------
-- Compatibilidad entre la inmutabilidad del log y el borrado de cuentas
-- -----------------------------------------------------------------------------
-- audit_log.actor_user_id es ON DELETE SET NULL, y el log guarda `actor_email`
-- precisamente para "si la cuenta se elimina, el registro sigue diciendo quien
-- fue". Pero `reject_audit_log_mutation` rechaza TODO update, incluido el que
-- dispara ese mismo ON DELETE SET NULL: eliminar a un usuario que hubiera hecho
-- cualquier cosa auditada fallaba con "audit_log es inmutable".
--
-- El fallo no aparece con una cuenta recien creada —nunca actuo, no hay filas
-- que anonimizar— sino justo con la que lleva meses trabajando, que es la que de
-- verdad se da de baja.
--
-- La excepcion se define lo mas estrecha posible: se permite el UPDATE solo si
-- deja actor_user_id en NULL y NINGUNA otra columna cambia. Comparando los dos
-- jsonb menos esa clave, cualquier intento de editar la accion, el diff o la
-- marca de tiempo aprovechando este hueco sigue chocando con la excepcion.
--
-- No abre superficie nueva: UPDATE sobre audit_log esta revocado a anon,
-- authenticated y service_role, asi que el unico camino que llega hasta aqui es
-- el cascade de la clave foranea.
--
-- CUIDADO AL TOCAR ESTA FUNCION: tiene DOS excepciones y vienen de sitios
-- distintos. La de DELETE la introdujo 20260806121500_tenant_offboarding_path
-- para que se pueda dar de baja un tenant (terminacion de contrato y derecho de
-- supresion, Ley 1581 de 2012 art. 8). La primera version de este archivo la
-- perdio al reescribir la funcion, y `purge_organization` dejo de funcionar sin
-- que ninguna prueba lo notara. Un `create or replace` sobre una funcion ajena
-- se lleva por delante lo que no se vuelva a escribir.
create or replace function public.reject_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Baja de tenant: solo filas del tenant EXACTO marcado, y la marca solo la
  -- pone purge_organization(), reservada a service_role.
  if tg_op = 'DELETE'
     and coalesce(current_setting('nortis.purge_organization', true), '') = old.organization_id::text then
    return old;
  end if;

  -- Anonimizacion del actor al eliminar un usuario.
  if tg_op = 'UPDATE'
     and old.actor_user_id is not null
     and new.actor_user_id is null
     and (to_jsonb(new) - 'actor_user_id') = (to_jsonb(old) - 'actor_user_id')
  then
    return new;
  end if;

  raise exception 'audit_log es inmutable: no se permite %', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

-- -----------------------------------------------------------------------------
-- Auditoria del alta
-- -----------------------------------------------------------------------------
-- El trigger original cubria UPDATE y DELETE porque, hasta ahora, la unica via
-- de INSERT en public.users era aceptar una invitacion. Con el alta directa,
-- "quien metio a esta persona en la organizacion" pasa a ser una pregunta que la
-- auditoria tiene que poder responder.
drop trigger if exists users_audit on public.users;

create trigger users_audit
  after insert or update or delete on public.users
  for each row execute function public.log_admin_change();

-- =============================================================================
-- Retirada del flujo de invitaciones
-- =============================================================================
-- Sustituido por el alta directa. Se revocan los privilegios de ejecucion en vez
-- de hacer DROP de las funciones y la tabla: `invitations` guarda quien invito a
-- cada miembro actual y con que rol, que es historial de control de acceso y no
-- se tira. Sin EXECUTE, las RPC dejan de ser alcanzables desde PostgREST — que
-- es lo que importa — y la evidencia se conserva.
revoke execute on function public.create_invitation(text, public.app_role, integer) from public, anon, authenticated;
revoke execute on function public.preview_invitation(text)                          from public, anon, authenticated;
revoke execute on function public.accept_invitation(text)                           from public, anon, authenticated;

-- Funcion de trigger del mismo flujo. Una funcion de trigger nunca deberia ser
-- invocable como RPC; lo era por el GRANT por defecto a PUBLIC.
revoke execute on function public.assert_invitee_not_member() from public, anon, authenticated;
