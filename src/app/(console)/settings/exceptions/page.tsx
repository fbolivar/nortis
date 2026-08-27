import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import {
  ExceptionsManager,
  type ExceptionRow,
} from '@/features/exceptions/components/exceptions-manager'

export default async function ExceptionsSettingsPage() {
  const supabase = await createClient()
  const session = await getSessionContext()
  const canApprove = session?.role === 'owner' || session?.role === 'admin'

  const [{ data: exceptions }, { data: endpoints }] = await Promise.all([
    supabase
      .from('policy_exceptions')
      .select('id, kind, value, reason, status, expires_at, created_at, endpoints(hostname)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('endpoints').select('id, hostname').order('hostname'),
  ])

  type Row = {
    id: string
    kind: 'usb' | 'app' | 'web'
    value: string
    reason: string | null
    status: 'pending' | 'approved' | 'rejected'
    expires_at: string | null
    created_at: string
    endpoints: { hostname: string } | null
  }
  const rows: ExceptionRow[] = ((exceptions ?? []) as unknown as Row[]).map((x) => ({
    id: x.id,
    kind: x.kind,
    value: x.value,
    reason: x.reason,
    status: x.status,
    expires_at: x.expires_at,
    created_at: x.created_at,
    endpoint_hostname: x.endpoints?.hostname ?? null,
  }))

  return (
    <>
      <PageHeader
        title="Excepciones"
        description="Permitir temporalmente un USB, una app o un dominio; un administrador aprueba con caducidad"
      />
      <div className="page-body">
        <ExceptionsManager
          initial={rows}
          endpoints={endpoints ?? []}
          canApprove={canApprove}
        />
      </div>
    </>
  )
}
