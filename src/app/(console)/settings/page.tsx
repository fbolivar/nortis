import { redirect } from 'next/navigation'
import { getSessionContext } from '@/features/auth/services/session'
import { ConsentPanel } from '@/features/tenant/components/consent-panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import type { PlanTier } from '@/shared/types/database'

const PLAN_LABEL: Record<PlanTier, string> = {
  trial: 'Prueba',
  starter: 'Starter',
  business: 'Business',
  enterprise: 'Enterprise',
}

export default async function OrganizationSettingsPage() {
  const session = await getSessionContext()
  if (!session?.organization) redirect('/onboarding')

  const org = session.organization

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Datos de la organizacion</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Nombre</dt>
              <dd className="mt-0.5 text-sm">{org.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Identificador</dt>
              <dd className="mt-0.5 font-mono text-sm">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-0.5 text-sm">{PLAN_LABEL[org.plan_tier]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Creada</dt>
              <dd className="mt-0.5 text-sm tabular-nums">{formatDateTime(org.created_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ConsentPanel organization={org} canEdit={session.role === 'owner'} />
    </div>
  )
}
