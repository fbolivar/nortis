import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { UsersTable } from '@/features/tenant/components/users-table'
import { Callout } from '@/shared/components/ui'

export default async function UsersPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <Callout tone="critical" title="No se pudieron cargar los usuarios">
        {error.message}
      </Callout>
    )
  }

  return (
    <UsersTable
      users={data ?? []}
      currentUserId={session?.userId ?? ''}
      isOwner={session?.role === 'owner'}
    />
  )
}
