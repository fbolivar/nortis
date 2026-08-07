-- =============================================================================
-- Nortis | 09 - encrypted_documents (metadatos de cifrado)
-- =============================================================================
-- INVARIANTE ABSOLUTO DE ESTA TABLA: aqui NO entra contenido en claro, ni
-- material de clave, ni el nombre real del archivo.
--
-- Por que ni siquiera el nombre: "liquidacion_despido_juan_perez.docx" filtra
-- el secreto sin necesidad de abrir el documento. Se guarda filename_hash para
-- poder deduplicar y correlacionar, y filename_encrypted (cifrado con la clave
-- del tenant) para poder mostrarselo a quien tiene derecho a verlo — que se
-- descifra en el cliente, nunca en la base.
--
-- La clave del tenant vive en Supabase Vault, jamas en una columna de esta tabla
-- ni en una variable de entorno del navegador (requisito A.6.3).
-- =============================================================================

create table public.encrypted_documents (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,

  owner_user_id            uuid references public.users(id) on delete set null,

  -- SHA-256 del nombre original. Identificador estable sin valor semantico.
  filename_hash            text not null,
  -- Nombre original cifrado (base64 del ciphertext). Se descifra en el cliente.
  filename_encrypted       text,

  content_hash             text,          -- SHA-256 del texto plano: detecta reenvios del mismo documento
  size_bytes               bigint check (size_bytes is null or size_bytes >= 0),
  mime_type                text,

  encryption_scheme        public.encryption_scheme not null default 'aes_256_gcm_tenant_key',

  -- Referencia a la clave en Supabase Vault. Es un identificador, NO la clave.
  vault_key_id             uuid,

  -- Ruta del blob cifrado en Storage.
  storage_path             text,

  recipient_type           public.recipient_type not null default 'internal',
  external_recipient_email text,

  -- Envio a terceros: se guarda solo el HASH de la credencial de un solo uso.
  -- Si se guardara la credencial, cualquiera con acceso a la base podria abrir
  -- todos los paquetes enviados a externos — exactamente el escenario que este
  -- modulo existe para evitar.
  access_credential_hash   text,
  access_expires_at        timestamptz,
  access_max_downloads     integer default 1 check (access_max_downloads is null or access_max_downloads > 0),
  access_download_count    integer not null default 0,
  first_downloaded_at      timestamptz,
  revoked_at               timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Un envio externo sin destinatario ni caducidad seria un enlace publico
  -- eterno. Se prohibe crearlo.
  constraint encrypted_documents_external_is_bounded check (
    recipient_type = 'internal'
    or (external_recipient_email is not null and access_expires_at is not null)
  )
);

create index encrypted_documents_org_idx on public.encrypted_documents (organization_id, created_at desc);
create index encrypted_documents_owner_idx on public.encrypted_documents (owner_user_id);
create index encrypted_documents_filename_hash_idx on public.encrypted_documents (organization_id, filename_hash);
create index encrypted_documents_external_active_idx
  on public.encrypted_documents (organization_id, access_expires_at)
  where recipient_type = 'external' and revoked_at is null;

create trigger encrypted_documents_set_updated_at
  before update on public.encrypted_documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.encrypted_documents enable row level security;

revoke all on public.encrypted_documents from anon, authenticated;

-- El hash de la credencial de acceso NUNCA se expone al cliente, ni al owner.
-- Solo lo lee el Route Handler de descarga, con service_role.
grant select (
  id, organization_id, owner_user_id, filename_hash, filename_encrypted,
  content_hash, size_bytes, mime_type, encryption_scheme, storage_path,
  recipient_type, external_recipient_email, access_expires_at,
  access_max_downloads, access_download_count, first_downloaded_at,
  revoked_at, created_at, updated_at
) on public.encrypted_documents to authenticated;

grant insert on public.encrypted_documents to authenticated;
grant update (revoked_at, access_expires_at, filename_encrypted) on public.encrypted_documents to authenticated;
grant delete on public.encrypted_documents to authenticated;

-- Lectura: el dueño ve lo suyo; owner/admin ven todo el tenant (necesario para
-- la pagina de cumplimiento y para revocar envios de un empleado que salio).
-- Un viewer NO ve documentos de otros: es un rol de auditoria de politica, no
-- de acceso al material confidencial.
create policy encrypted_documents_select_own_or_admin
  on public.encrypted_documents
  for select
  to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (owner_user_id = (select auth.uid()) or (select public.is_org_admin()))
  );

-- Al crear, el documento queda a nombre de quien lo sube. No se puede cifrar
-- "en nombre de otro".
create policy encrypted_documents_insert_own
  on public.encrypted_documents
  for insert
  to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and owner_user_id = (select auth.uid())
  );

-- Revocar un envio: el dueño o un admin.
create policy encrypted_documents_update_own_or_admin
  on public.encrypted_documents
  for update
  to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (owner_user_id = (select auth.uid()) or (select public.is_org_admin()))
  )
  with check (
    organization_id = (select public.current_org_id())
    and (owner_user_id = (select auth.uid()) or (select public.is_org_admin()))
  );

create policy encrypted_documents_delete_admin
  on public.encrypted_documents
  for delete
  to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy encrypted_documents_require_mfa
  on public.encrypted_documents
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

-- Un envio revocado no se puede reactivar: la revocacion existe porque el
-- destinatario dejo de ser de confianza.
create or replace function public.assert_document_revocation_is_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'Un documento revocado no puede reactivarse; genere un nuevo envio';
  end if;
  return new;
end;
$$;

create trigger encrypted_documents_revocation_is_final
  before update on public.encrypted_documents
  for each row execute function public.assert_document_revocation_is_final();
