-- =============================================================================
-- Nortis | 13 - Generacion de API keys dentro de la base
-- =============================================================================
-- Alternativa deliberada a generar la clave en un Route Handler con service_role:
--   1. El texto plano de la credencial nunca transita por codigo de aplicacion,
--      ni por logs de Next.js, ni por la memoria del proceso de Node. Se genera,
--      se hashea y se devuelve una vez, todo dentro de Postgres.
--   2. La consola no necesita la service_role key para operar el Modulo 5. La
--      clave que salta TODO el RLS no tiene por que existir en el entorno de la
--      app para una funcion de administracion rutinaria.
--
-- El control de acceso va DENTRO de la funcion, no por RLS: al ser SECURITY
-- DEFINER hay que replicar explicitamente lo que las politicas de api_keys
-- exigirian, incluido el requisito de MFA. Omitir esa comprobacion convertiria
-- esta funcion en un bypass del control de segundo factor.
create or replace function public.create_api_key(
  p_name       text,
  p_expires_at timestamptz default null
)
returns table (id uuid, api_key text, key_prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_secret text;
  v_key    text;
  v_prefix text;
  v_id     uuid;
begin
  if v_org_id is null then
    raise exception 'Se requiere sesion autenticada' using errcode = '42501';
  end if;

  if not public.is_org_admin() then
    raise exception 'Solo owner o admin pueden generar API keys' using errcode = '42501';
  end if;

  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor para generar API keys' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'El nombre de la API key es obligatorio';
  end if;

  -- 32 bytes del CSPRNG de pgcrypto.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  v_key    := 'nrt_live_' || v_secret;
  v_prefix := left(v_key, 16);

  insert into public.api_keys (organization_id, name, key_hash, key_prefix, created_by, expires_at)
  values (
    v_org_id,
    btrim(p_name),
    encode(extensions.digest(v_key, 'sha256'), 'hex'),
    v_prefix,
    (select auth.uid()),
    p_expires_at
  )
  returning public.api_keys.id into v_id;

  -- Unica vez que el texto plano sale de la base. La UI debe advertir que no
  -- se puede volver a mostrar.
  return query select v_id, v_key, v_prefix;
end;
$$;

revoke execute on function public.create_api_key(text, timestamptz) from public, anon;
grant   execute on function public.create_api_key(text, timestamptz) to authenticated;
