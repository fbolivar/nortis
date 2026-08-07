-- =============================================================================
-- Nortis | 21 - Bucket de documentos cifrados (Modulo 4)
-- =============================================================================
-- Bucket PRIVADO. Nunca publico, ni siquiera "por comodidad": un bucket publico
-- convierte cada storage_path en una URL descargable por cualquiera que la
-- adivine o la vea en un log de proxy. Lo que se guarda ya esta cifrado, pero
-- eso no es excusa — un atacante con el blob puede intentar criptoanalisis
-- offline sin limite de tiempo, y nosotros perdemos la capacidad de auditar
-- quien lo descargo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'encrypted-documents', 'encrypted-documents', false,
  104857600,  -- 100 MB. El cifrado ocurre en el navegador y todo el archivo pasa
              -- por memoria; sin tope, un archivo de 2 GB cuelga la pestaña.
  array['application/octet-stream']  -- Solo ciphertext opaco. Aceptar el MIME
              -- real filtraria el tipo de documento (que un contrato sea .docx
              -- ya es informacion) y permitiria subir contenido sin cifrar.
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Convencion de rutas: <organization_id>/<document_id>
-- El primer segmento ES la frontera del tenant. RLS de las TABLAS no protege a
-- Storage, que es un esquema aparte con sus propias politicas: sin estas,
-- cualquier usuario autenticado de cualquier cliente podria listar y descargar
-- los blobs de los demas.
drop policy if exists "nortis_encrypted_read"   on storage.objects;
drop policy if exists "nortis_encrypted_insert" on storage.objects;
drop policy if exists "nortis_encrypted_delete" on storage.objects;

create policy "nortis_encrypted_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'encrypted-documents'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text);

create policy "nortis_encrypted_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'encrypted-documents'
              and (storage.foldername(name))[1] = (select public.current_org_id())::text);

-- Sin UPDATE: un blob cifrado no se modifica en sitio. Reemplazarlo dejaria el
-- registro apuntando a un contenido distinto del que se registro, y el hash
-- almacenado dejaria de corresponder.
create policy "nortis_encrypted_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'encrypted-documents'
         and (storage.foldername(name))[1] = (select public.current_org_id())::text);
