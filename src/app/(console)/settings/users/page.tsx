import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { UsersTable } from '@/features/tenant/components/users-table'
import { OwnPasswordCard } from '@/features/tenant/components/own-password-card'
import { Callout } from '@/shared/components/ui'

export default async function UsersPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  const [{ data: users, error }, { data: sites }] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: true }),
    supabase.from('sites').select('id, name').order('name'),
  ])

  if (error) {
    return (
      <Callout tone="critical" title="No se pudieron cargar los usuarios">
        {error.message}
      </Callout>
    )
  }

  // Los flags solo deciden que se DIBUJA. La autorizacion real vive en las RPC
  // admin_*, que repiten cada comprobacion: esta pagina no protege nada.
  const canManage = session?.role === 'owner' || session?.role === 'admin'
  // Solo la consola CENTRAL (el propio usuario sin sede) asigna usuarios a sedes.
  const currentUser = (users ?? []).find((u) => u.id === session?.userId)
  const canAssignSites = canManage && !currentUser?.site_id

  return (
    <div className="max-w-4xl space-y-5">
      <UsersTable
        users={users ?? []}
        currentUserId={session?.userId ?? ''}
        isOwner={session?.role === 'owner'}
        canManage={canManage}
        sites={sites ?? []}
        canAssignSites={canAssignSites}
      />

      <OwnPasswordCard email={session?.email ?? ''} />
    </div>
  )
}
