-- =============================================================================
-- Nortis | Versiones publicadas del agente (auto-actualizacion)
-- =============================================================================
-- Cada fila es una version del agente que se puede desplegar: el MSI (guardado
-- en el bucket agent-dist), su sha256 y una URL de descarga firmada de larga
-- duracion. El agente consulta /api/agent/version, y si la version marcada como
-- actual es mas nueva que la suya, descarga por esa URL, verifica el sha256 y se
-- actualiza. Publicar una vez en la consola llega a toda la flota.
--
-- La URL firmada se guarda hecha, no se genera al vuelo: la ruta /api/agent/version
-- es publica (el agente no tiene sesion) y no podria firmar contra un bucket
-- privado. Quien la firma es el admin al publicar, que si tiene sesion.
create table if not exists public.agent_releases (
  id           uuid primary key default gen_random_uuid(),
  version      text not null,
  object_name  text not null,            -- nombre del MSI dentro del bucket agent-dist
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes   bigint,
  download_url text not null,            -- URL firmada de larga duracion al MSI
  notes        text,
  is_current   boolean not null default false,
  published_by uuid references public.users(id) on delete set null,
  published_at timestamptz not null default now()
);

-- A lo sumo UNA version marcada como actual. El indice parcial lo garantiza en
-- la base: dos "actuales" a la vez dejarian a la flota partida entre dos binarios.
create unique index if not exists agent_releases_una_actual
  on public.agent_releases (is_current) where is_current;

alter table public.agent_releases enable row level security;

-- Lectura para usuarios autenticados: el panel de versiones la muestra. No hay
-- dato de tenant aqui —el binario es comun a todos— asi que no se acota por
-- organizacion.
drop policy if exists "agent_releases_read" on public.agent_releases;
create policy "agent_releases_read"
  on public.agent_releases for select to authenticated using (true);

-- Sin politicas de escritura: publicar pasa por el RPC set_current_agent_release,
-- que comprueba rol y MFA. Nadie inserta una version a mano desde una sesion.

-- ---------------------------------------------------------------------------
-- current_agent_release: la version vigente, para la ruta publica /api/agent/version.
-- SECURITY DEFINER y ejecutable por anon a proposito: el agente no tiene sesion.
-- Solo expone lo imprescindible para actualizarse; nada de otras versiones ni
-- de quien publico.
create or replace function public.current_agent_release()
returns table (version text, sha256 text, download_url text)
language sql
security definer
stable
set search_path = ''
as $$
  select r.version, r.sha256, r.download_url
    from public.agent_releases r
   where r.is_current
   limit 1;
$$;

revoke execute on function public.current_agent_release() from public;
grant   execute on function public.current_agent_release() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_current_agent_release: publica una version y la marca como la actual.
-- La URL firmada y el sha256 los calcula la ruta (que tiene acceso al Storage);
-- este RPC solo persiste y aplica la regla de "una sola actual", tras comprobar
-- que quien llama es admin con segundo factor.
create or replace function public.set_current_agent_release(
  p_version      text,
  p_object_name  text,
  p_sha256       text,
  p_download_url text,
  p_size_bytes   bigint default null,
  p_notes        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_org_admin() then
    raise exception 'Solo owner o admin pueden publicar versiones del agente' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor para publicar versiones' using errcode = '42501';
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'sha256 invalido';
  end if;

  -- Se baja la actual antes de subir la nueva: el indice parcial no admite dos.
  update public.agent_releases set is_current = false where is_current;

  insert into public.agent_releases
    (version, object_name, sha256, size_bytes, download_url, notes, is_current, published_by)
  values
    (p_version, p_object_name, p_sha256, p_size_bytes, p_download_url, p_notes, true, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.set_current_agent_release(text, text, text, text, bigint, text) from public, anon;
grant   execute on function public.set_current_agent_release(text, text, text, text, bigint, text) to authenticated;
