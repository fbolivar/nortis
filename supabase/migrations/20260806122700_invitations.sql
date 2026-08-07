-- =============================================================================
-- Nortis | 27 - Invitaciones de usuarios de consola (Modulo 5)
-- =============================================================================
-- Cierra el unico hueco funcional que quedaba del Modulo 5: hasta ahora no habia
-- forma de sumar a un segundo usuario. Quien se registraba creaba SU PROPIA
-- organizacion, asi que toda cuenta era de un solo miembro y el modelo de roles
-- (owner/admin/viewer) describia siempre a la misma persona.
--
-- La tabla no figura en el modelo de datos de A.3, pero A.4 exige invitaciones
-- en el Modulo 5.

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- En minusculas para que la comparacion con el correo de la cuenta que acepta
  -- no dependa de como se escribio.
  email           text not null check (position('@' in email) > 1),
  role            public.app_role not null default 'viewer',

  -- SHA-256 del token. El texto plano se muestra UNA vez a quien invita y no se
  -- persiste: un volcado de esta tabla no permite aceptar ninguna invitacion.
  token_hash      text not null unique,

  invited_by      uuid references public.users(id) on delete set null,
  -- Caducidad obligatoria (no nullable): una invitacion eterna es una puerta
  -- abierta que nadie recuerda haber dejado.
  expires_at      timestamptz not null,

  accepted_at     timestamptz,
  accepted_by     uuid references public.users(id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index invitations_org_idx on public.invitations (organization_id, created_at desc);

-- Una sola invitacion viva por correo y organizacion. Sin esto, invitar tres
-- veces al mismo correo deja tres enlaces validos, y revocar uno da una falsa
-- sensacion de haber cerrado el acceso.
create unique index invitations_pending_email_idx
  on public.invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

create or replace function public.assert_invitee_not_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.users u
     where u.organization_id = new.organization_id
       and lower(u.email) = lower(new.email)
  ) then
    raise exception 'Esa persona ya pertenece a la organizacion';
  end if;
  return new;
end;
$$;

create trigger invitations_assert_not_member
  before insert on public.invitations
  for each row execute function public.assert_invitee_not_member();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.invitations enable row level security;

revoke all on public.invitations from anon, authenticated;

-- token_hash NUNCA se concede: RLS filtra filas, no columnas, y quien pudiera
-- leer el hash podria intentar fuerza bruta contra el token fuera de linea.
grant select (
  id, organization_id, email, role, invited_by, expires_at,
  accepted_at, accepted_by, revoked_at, revoked_by, created_at
) on public.invitations to authenticated;

grant update (revoked_at, revoked_by) on public.invitations to authenticated;

-- Sin INSERT: crear una invitacion implica generar el token y hashearlo, y eso
-- ocurre dentro de Postgres, igual que con las API keys.

create policy invitations_select_admin
  on public.invitations for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy invitations_revoke_admin
  on public.invitations for update to authenticated
  using  (organization_id = (select public.current_org_id()) and (select public.is_org_admin()))
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy invitations_require_mfa
  on public.invitations as restrictive for all to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

-- -----------------------------------------------------------------------------
-- Crear invitacion
-- -----------------------------------------------------------------------------
-- El token se genera y hashea dentro de la base; el texto plano sale una sola
-- vez. Mismo criterio que create_api_key: la credencial no pasa por codigo de
-- aplicacion ni por los logs de Node.
create or replace function public.create_invitation(
  p_email text,
  p_role  public.app_role default 'viewer',
  p_days  integer default 7
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_token  text;
  v_id     uuid;
  v_exp    timestamptz;
begin
  if v_org_id is null then
    raise exception 'Se requiere sesion autenticada' using errcode = '42501';
  end if;
  if not public.is_org_admin() then
    raise exception 'Solo owner o admin pueden invitar' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor' using errcode = '42501';
  end if;

  -- Solo el owner reparte el rol de administrador. Un admin que pudiera nombrar
  -- a otro escalaria privilegios de lado.
  if p_role in ('owner', 'admin') and not public.is_org_owner() then
    raise exception 'Solo el owner puede invitar con rol de administrador' using errcode = '42501';
  end if;

  if p_role = 'owner' then
    raise exception 'La propiedad se transfiere, no se invita';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp   := now() + make_interval(days => greatest(1, least(p_days, 30)));

  insert into public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
  values (
    v_org_id, lower(btrim(p_email)), p_role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    (select auth.uid()), v_exp
  )
  returning public.invitations.id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vista previa (pagina publica del enlace)
-- -----------------------------------------------------------------------------
-- Devuelve lo minimo para que quien recibe el enlace sepa a que le invitan. NO
-- revela el listado de miembros ni nada del tenant mas alla de su nombre.
create or replace function public.preview_invitation(p_token text)
returns table (organization_name text, email text, role public.app_role, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare v_inv record;
begin
  select i.*, o.name as org_name into v_inv
    from public.invitations i
    join public.organizations o on o.id = i.organization_id
   where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  -- Un unico mensaje para token inexistente, vencido, revocado o ya usado:
  -- distinguirlos permitiria sondear que invitaciones existieron.
  if v_inv.id is null
     or v_inv.revoked_at is not null
     or v_inv.accepted_at is not null
     or v_inv.expires_at <= now() then
    raise exception 'La invitacion no es valida o ya vencio' using errcode = '42501';
  end if;

  return query select v_inv.org_name, v_inv.email, v_inv.role, v_inv.expires_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aceptar invitacion
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email   text;
  v_inv     record;
begin
  if v_user_id is null then
    raise exception 'Se requiere sesion autenticada' using errcode = '42501';
  end if;

  if exists (select 1 from public.users u where u.id = v_user_id) then
    raise exception 'Su cuenta ya pertenece a una organizacion';
  end if;

  select au.email into v_email from auth.users au where au.id = v_user_id;

  select * into v_inv from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;

  if v_inv.id is null
     or v_inv.revoked_at is not null
     or v_inv.accepted_at is not null
     or v_inv.expires_at <= now() then
    raise exception 'La invitacion no es valida o ya vencio' using errcode = '42501';
  end if;

  -- EL CORREO DEBE COINCIDIR. Sin esto, quien interceptara el enlace —en un
  -- correo reenviado, en un chat— entraria a la organizacion con una cuenta
  -- propia. El enlace deja de ser un portador universal de acceso.
  if lower(v_email) <> lower(v_inv.email) then
    raise exception 'Esta invitacion es para %, no para su cuenta', v_inv.email
      using errcode = '42501';
  end if;

  insert into public.users (id, organization_id, email, role)
  values (v_user_id, v_inv.organization_id, v_email, v_inv.role);

  update public.invitations
     set accepted_at = now(), accepted_by = v_user_id
   where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

revoke execute on function public.create_invitation(text, public.app_role, integer) from public, anon;
revoke execute on function public.preview_invitation(text)                          from public;
revoke execute on function public.accept_invitation(text)                           from public, anon;

grant execute on function public.create_invitation(text, public.app_role, integer) to authenticated;
-- preview es callable por anon: quien recibe el enlace todavia no tiene cuenta.
grant execute on function public.preview_invitation(text)                          to anon, authenticated;
grant execute on function public.accept_invitation(text)                           to authenticated;
