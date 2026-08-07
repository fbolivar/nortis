-- =============================================================================
-- Nortis | 06 - api_keys (autenticacion de agentes por tenant)
-- =============================================================================
-- La API key viaja dentro del instalador MSI y vive cifrada con DPAPI en cada
-- endpoint. Es el unico secreto que el agente conoce, y con el puede escribir
-- telemetria: hay que tratarla como una credencial, no como un identificador.
-- =============================================================================

create table public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name            text not null check (length(btrim(name)) between 2 and 80),

  -- SHA-256 de la clave. El valor en claro se muestra UNA sola vez, al crearla,
  -- y no se persiste jamas. Si un atacante consigue un volcado de esta tabla,
  -- no obtiene credenciales utilizables.
  key_hash        text not null,

  -- Primeros caracteres de la clave, para que el admin identifique cual es cual
  -- en la UI sin revelar el secreto ("nrt_live_a3f2...").
  key_prefix      text not null,

  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  -- Ultimo uso: permite detectar keys huerfanas que conviene revocar.
  last_used_at    timestamptz,

  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid references public.users(id) on delete set null
);

-- Indice unico sobre el hash: es el camino de lookup del endpoint de ingesta.
-- Al ser unico ademas impide colisiones de clave entre tenants.
create unique index api_keys_key_hash_idx on public.api_keys (key_hash);
create index api_keys_organization_id_idx on public.api_keys (organization_id);
create index api_keys_active_idx on public.api_keys (organization_id) where revoked_at is null;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.api_keys enable row level security;

revoke all on public.api_keys from anon, authenticated;

-- Permisos a nivel de COLUMNA, no solo de fila.
--
-- RLS filtra filas; no puede ocultar una columna. Sin esto, un admin legitimo
-- podria hacer `select key_hash from api_keys` desde el navegador y llevarse los
-- hashes de todas las claves de su tenant a un cracker offline. El admin
-- necesita ver el inventario de claves, no su material criptografico.
grant select (
  id, organization_id, name, key_prefix, created_by, created_at,
  last_used_at, expires_at, revoked_at, revoked_by
) on public.api_keys to authenticated;

-- Revocar: unico UPDATE que el cliente necesita.
grant update (revoked_at, revoked_by) on public.api_keys to authenticated;

-- Sin INSERT ni DELETE para authenticated: generar una clave implica producir el
-- secreto y hashearlo, y eso ocurre server-side con service_role. Las claves no
-- se borran, se revocan — borrarlas destruiria la trazabilidad de que agente
-- reporto que.

create policy api_keys_select_admin
  on public.api_keys
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy api_keys_revoke_admin
  on public.api_keys
  for update
  to authenticated
  using  (organization_id = (select public.current_org_id()) and (select public.is_org_admin()))
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy api_keys_require_mfa
  on public.api_keys
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

-- Una clave revocada no vuelve a la vida: reactivarla reabriria un canal de
-- ingesta que ya se dio por comprometido.
create or replace function public.assert_api_key_revocation_is_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'Una API key revocada no puede reactivarse; genere una nueva';
  end if;
  return new;
end;
$$;

create trigger api_keys_revocation_is_final
  before update on public.api_keys
  for each row execute function public.assert_api_key_revocation_is_final();

-- -----------------------------------------------------------------------------
-- Resolucion de clave para el pipeline de ingesta
-- -----------------------------------------------------------------------------
-- La llama el Route Handler con service_role. Centraliza aqui la validacion
-- (revocada / expirada) para que ningun endpoint de la API pueda olvidarse de
-- comprobar una de las dos condiciones.
create or replace function public.resolve_api_key(p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  select k.organization_id
    into v_org_id
    from public.api_keys k
   where k.key_hash = p_key_hash
     and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now());

  if v_org_id is null then
    return null;
  end if;

  update public.api_keys
     set last_used_at = now()
   where key_hash = p_key_hash;

  return v_org_id;
end;
$$;

revoke execute on function public.resolve_api_key(text) from public, anon, authenticated;
-- Solo service_role. Si esta funcion fuera invocable desde el navegador, seria
-- un oraculo para validar hashes de clave por fuerza bruta.
grant execute on function public.resolve_api_key(text) to service_role;
