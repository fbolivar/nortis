import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { Callout } from '@/shared/components/ui'
import { VaultManager } from '@/features/vault/components/vault-manager'
import type { EncryptedDocument } from '@/shared/types/database'

export default async function VaultPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  if (!session?.organization) redirect('/onboarding')

  // Se seleccionan columnas explicitas: access_credential_hash y las claves
  // envueltas no tienen por que viajar al listado. La clave envuelta solo se
  // necesita en el momento de descifrar, y entonces la entrega unwrap_data_key
  // tras comprobar permisos.
  const { data, error } = await supabase
    .from('encrypted_documents')
    .select(
      'id, organization_id, owner_user_id, filename_hash, content_hash, size_bytes, mime_type, encryption_scheme, storage_path, recipient_type, external_recipient_email, access_expires_at, access_max_downloads, access_download_count, first_downloaded_at, revoked_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <>
        <PageHeader title="Cifrado" description="Documentos protegidos" />
        <div className="page-body">
          <Callout tone="critical" title="No se pudieron cargar los documentos">
            {error.message}
          </Callout>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Cifrado"
        description="Documentos cifrados y envios seguros a terceros"
      />
      <div className="page-body">
        <VaultManager
          documents={(data ?? []) as EncryptedDocument[]}
          organizationId={session.organization.id}
          canManage={session.role === 'owner' || session.role === 'admin'}
        />
      </div>
    </>
  )
}
