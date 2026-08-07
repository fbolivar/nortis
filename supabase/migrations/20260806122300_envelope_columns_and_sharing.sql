-- =============================================================================
-- Nortis | 23 - Columnas de sobre y canal de envio a terceros
-- =============================================================================
alter table public.encrypted_documents
  -- Clave de datos envuelta con la clave maestra del tenant (uso interno).
  add column if not exists wrapped_data_key text,
  -- Clave de datos envuelta con una clave derivada de la credencial de un solo
  -- uso (uso externo). Son dos envolturas de LA MISMA clave: el archivo se cifra
  -- una sola vez.
  add column if not exists external_wrapped_key text,
  -- Sal de la derivacion PBKDF2 de esa credencial.
  add column if not exists external_wrap_salt text,
  -- Identificador publico del enlace de descarga.
  add column if not exists share_token text;

create unique index if not exists encrypted_documents_share_token_idx
  on public.encrypted_documents (share_token) where share_token is not null;

comment on column public.encrypted_documents.wrapped_data_key is
  'Clave de datos cifrada con la clave maestra del tenant (Vault). Inutil sin acceso a Vault.';
comment on column public.encrypted_documents.external_wrapped_key is
  'Clave de datos cifrada con la clave derivada de la credencial de un solo uso. El servidor NUNCA ve esa credencial.';

-- Bucket de paquetes para terceros: lectura publica, con ruta imposible de
-- adivinar (token de 32 bytes aleatorios). Decision consciente:
--   - Lo que se sirve es ciphertext AES-256-GCM; sin la clave de datos es ruido,
--     y esa clave solo la entrega el RPC de abajo, que comprueba vencimiento,
--     revocacion y numero de descargas.
--   - Es lo que hace REAL la revocacion: aunque alguien conserve el enlace del
--     blob, sin la clave envuelta el archivo es indescifrable para siempre.
--   - La alternativa (URLs firmadas) exige la service_role key en el servidor de
--     la aplicacion, y no vale introducir esa dependencia para contenido opaco.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shared-packages', 'shared-packages', true, 104857600, array['application/octet-stream'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists "nortis_shared_insert" on storage.objects;
drop policy if exists "nortis_shared_delete" on storage.objects;

create policy "nortis_shared_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'shared-packages'
              and (storage.foldername(name))[1] = (select public.current_org_id())::text);

create policy "nortis_shared_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'shared-packages'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text);

-- Apertura de un paquete compartido. Callable por `anon`: el destinatario no
-- tiene cuenta, que es todo el punto de la funcionalidad.
--
-- Devuelve la clave envuelta con la credencial. NO devuelve nada que permita
-- descifrar por si solo: quien tenga el enlace pero no la credencial obtiene una
-- clave que sigue cifrada. La credencial viaja por otro canal y JAMAS llega al
-- servidor — el navegador del destinatario deriva la clave con ella localmente.
--
-- Contar la descarga aqui y no al bajar el blob es deliberado: el blob se puede
-- reintentar por fallo de red, pero pedir la clave es lo que consume el acceso.
create or replace function public.open_shared_package(p_token text)
returns table (
  wrapped_key text, wrap_salt text, storage_path text,
  size_bytes bigint, expires_at timestamptz, downloads_remaining integer
)
language plpgsql security definer set search_path = ''
as $$
declare v_doc record;
begin
  select * into v_doc from public.encrypted_documents
   where share_token = p_token and recipient_type = 'external';

  -- Un unico mensaje para token inexistente, vencido o revocado: distinguirlos
  -- permitiria enumerar que enlaces existieron.
  if v_doc.id is null
     or v_doc.revoked_at is not null
     or (v_doc.access_expires_at is not null and v_doc.access_expires_at <= now())
     or (v_doc.access_max_downloads is not null
         and v_doc.access_download_count >= v_doc.access_max_downloads) then
    raise exception 'El enlace no es valido o ya vencio' using errcode = '42501';
  end if;

  update public.encrypted_documents
     set access_download_count = access_download_count + 1,
         first_downloaded_at   = coalesce(first_downloaded_at, now())
   where id = v_doc.id;

  return query select
    v_doc.external_wrapped_key, v_doc.external_wrap_salt, v_doc.storage_path,
    v_doc.size_bytes, v_doc.access_expires_at,
    case when v_doc.access_max_downloads is null then null
         else v_doc.access_max_downloads - v_doc.access_download_count - 1 end;
end;
$$;

revoke execute on function public.open_shared_package(text) from public;
grant   execute on function public.open_shared_package(text) to anon, authenticated;

grant update (
  revoked_at, access_expires_at, filename_encrypted,
  wrapped_data_key, external_wrapped_key, external_wrap_salt, share_token,
  storage_path, content_hash, size_bytes, mime_type, vault_key_id, encryption_scheme
) on public.encrypted_documents to authenticated;
