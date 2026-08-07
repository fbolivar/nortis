-- =============================================================================
-- Nortis | 22 - Custodia de claves y cifrado por sobre (Modulo 4)
-- =============================================================================
-- ARQUITECTURA: CIFRADO POR SOBRE (envelope encryption).
--
--   1. El NAVEGADOR genera una clave de datos aleatoria por documento (AES-256)
--      y cifra el archivo con ella. El texto plano nunca sale del equipo.
--   2. El SERVIDOR envuelve esa clave con la clave maestra del tenant, que vive
--      en Supabase Vault. Solo se almacena la clave envuelta.
--   3. Para descifrar, el navegador pide desenvolver la clave y descifra local.
--
-- Por que no cifrar el archivo en el servidor: asi el archivo completo nunca
-- viaja sin cifrar por la red ni pasa por la memoria de Node, y no hay que mover
-- megabytes a traves de Postgres.
--
-- Por que no extremo a extremo puro: esto es cifrado GESTIONADO. Si la unica
-- copia de la clave estuviera en el navegador de un empleado que se va de la
-- empresa, el cliente perderia sus propios documentos — exactamente el problema
-- que el producto promete evitar.
--
-- CONTRAPARTIDA QUE HAY QUE DECLARAR: al ser custodial, el servidor puede
-- desenvolver la clave de cualquier documento de un tenant. La proteccion real
-- es que la clave maestra vive en Vault (cifrada en reposo, fuera del alcance de
-- un volcado de la tabla) y que cada desenvoltura pasa por comprobacion de
-- permisos.

create or replace function public.tenant_key_id()
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_name   text;
  v_key_id uuid;
begin
  if v_org_id is null then
    raise exception 'Se requiere sesion autenticada' using errcode = '42501';
  end if;

  v_name := 'nortis_tenant_key_' || v_org_id::text;

  select id into v_key_id from vault.secrets where name = v_name;
  if v_key_id is not null then return v_key_id; end if;

  -- 32 bytes del CSPRNG. Es la clave maestra y no se devuelve nunca: solo su id.
  select vault.create_secret(
    encode(extensions.gen_random_bytes(32), 'base64'), v_name,
    'Clave maestra de cifrado de ' || v_org_id::text
  ) into v_key_id;

  return v_key_id;
end;
$$;

create or replace function public.wrap_data_key(p_data_key text)
returns table (wrapped_key text, vault_key_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_key_id uuid := public.tenant_key_id();
  v_master text;
begin
  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor' using errcode = '42501';
  end if;
  if p_data_key is null or length(p_data_key) < 16 then
    raise exception 'Clave de datos invalida';
  end if;

  select decrypted_secret into v_master from vault.decrypted_secrets where id = v_key_id;
  return query select encode(extensions.pgp_sym_encrypt(p_data_key, v_master), 'base64'), v_key_id;
end;
$$;

-- Recibe el ID del documento y NO la clave envuelta. La diferencia es todo el
-- control de acceso: si aceptara la clave envuelta, cualquiera que consiguiera
-- una (de un respaldo, de un log) podria pedir que se la desenvolvieran.
create or replace function public.unwrap_data_key(p_document_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_doc    record;
  v_master text;
begin
  if v_org_id is null then
    raise exception 'Se requiere sesion autenticada' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Se requiere segundo factor' using errcode = '42501';
  end if;

  select * into v_doc from public.encrypted_documents where id = p_document_id;

  -- Mismo mensaje para "no existe" y "es de otro tenant": distinguirlos
  -- convertiria la funcion en un oraculo para sondear documentos ajenos.
  if v_doc.id is null or v_doc.organization_id <> v_org_id then
    raise exception 'Documento no encontrado' using errcode = '42501';
  end if;

  -- Replica exacta de la politica RLS de lectura. Al ser SECURITY DEFINER, RLS
  -- no aplica y omitir esto seria un bypass.
  if v_doc.owner_user_id <> (select auth.uid()) and not public.is_org_admin() then
    raise exception 'Sin permiso sobre este documento' using errcode = '42501';
  end if;
  if v_doc.revoked_at is not null then
    raise exception 'Documento revocado' using errcode = '42501';
  end if;
  if v_doc.wrapped_data_key is null then
    raise exception 'El documento no tiene clave envuelta';
  end if;

  select decrypted_secret into v_master from vault.decrypted_secrets where id = v_doc.vault_key_id;
  if v_master is null then
    raise exception 'La clave maestra del tenant no esta disponible';
  end if;

  return extensions.pgp_sym_decrypt(decode(v_doc.wrapped_data_key, 'base64'), v_master);
end;
$$;

revoke execute on function public.tenant_key_id()       from public, anon;
revoke execute on function public.wrap_data_key(text)   from public, anon;
revoke execute on function public.unwrap_data_key(uuid) from public, anon;

grant execute on function public.tenant_key_id()       to authenticated;
grant execute on function public.wrap_data_key(text)   to authenticated;
grant execute on function public.unwrap_data_key(uuid) to authenticated;
