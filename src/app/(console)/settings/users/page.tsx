import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { UsersTable } from '@/features/tenant/components/users-table'
import {
  InvitationsPanel,
  type InvitationRow,
} from '@/features/tenant/components/invitations-panel'
import { Callout } from '@/shared/components/ui'

export default async function UsersPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  const [{ data: users, error }, { data: invitations }] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: true }),
    // token_hash no se selecciona: `authenticated` no tiene permiso de columna
    // sobre el, y pedirlo haria fallar la consulta entera.
    supabase
      .from('invitations')
      .select(
        'id, email, role, expires_at, accepted_at, revoked_at, created_at'
      )
      .order('created_at', { ascending: false }),
  ])

  if (error) {
    return (
      <Callout tone="critical" title="No se pudieron cargar los usuarios">
        {error.message}
      </Callout>
    )
  }

  const canInvite = session?.role === 'owner' || session?.role === 'admin'

  return (
    <div className="max-w-4xl space-y-5">
      <UsersTable
        users={users ?? []}
        currentUserId={session?.userId ?? ''}
        isOwner={session?.role === 'owner'}
      />

      <InvitationsPanel
        invitations={(invitations ?? []) as InvitationRow[]}
        canInvite={canInvite}
        isOwner={session?.role === 'owner'}
      />
    </div>
  )
}
