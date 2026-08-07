import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { ApiKeysManager } from '@/features/tenant/components/api-keys-manager'
import { Callout } from '@/shared/components/ui'

export default async function ApiKeysPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  // key_hash no se selecciona: `authenticated` no tiene permiso de columna sobre
  // el, y pedirlo haria fallar la consulta entera.
  const { data, error } = await supabase
    .from('api_keys')
    .select(
      'id, organization_id, name, key_prefix, created_by, created_at, last_used_at, expires_at, revoked_at, revoked_by'
    )
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <Callout tone="critical" title="No se pudieron cargar las credenciales">
        {error.message}
      </Callout>
    )
  }

  return (
    <ApiKeysManager
      apiKeys={data ?? []}
      canManage={session?.role === 'owner' || session?.role === 'admin'}
    />
  )
}
