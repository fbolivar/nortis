import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { StatTile } from '@/shared/components/stat-tile'
import { Callout } from '@/shared/components/ui'
import {
  IncidentQueue,
  type QueueIncident,
} from '@/features/incidents/components/incident-queue'

/** La cola se acota: revisar mas de 500 incidentes de una vez no es un flujo real. */
const QUEUE_LIMIT = 500

export default async function IncidentsPage() {
  const supabase = await createClient()
  const session = await getSessionContext()
  const canReview = session?.role === 'owner' || session?.role === 'admin'

  const { data, error } = await supabase
    .from('dlp_incidents')
    .select(
      'id, endpoint_id, rule_triggered, rule_channel, severity, status, enforcement_action, detected_at, event_snapshot, endpoints(hostname)'
    )
    .order('detected_at', { ascending: false })
    .limit(QUEUE_LIMIT)

  if (error) {
    return (
      <>
        <PageHeader title="Incidentes" description="Cola de revision" />
        <div className="p-6">
          <Callout tone="critical" title="No se pudo cargar la cola">
            {error.message}
          </Callout>
        </div>
      </>
    )
  }

  const incidents = (data ?? []) as unknown as QueueIncident[]
  const open = incidents.filter((i) => i.status === 'open')
  const critical = open.filter((i) => i.severity === 'critical').length
  const high = open.filter((i) => i.severity === 'high').length
  const falsePositives = incidents.filter((i) => i.status === 'false_positive').length

  return (
    <>
      <PageHeader
        title="Incidentes"
        description="Violaciones de politica detectadas en los equipos"
      />

      <div className="space-y-5 p-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Sin revisar"
            value={open.length}
            tone={open.length > 0 ? 'warning' : 'success'}
            hint={open.length === 0 ? 'Cola al dia' : undefined}
          />
          <StatTile
            label="Criticos abiertos"
            value={critical}
            tone={critical > 0 ? 'critical' : 'success'}
          />
          <StatTile label="Altos abiertos" value={high} tone={high > 0 ? 'critical' : 'success'} />
          <StatTile
            label="Falsos positivos"
            value={falsePositives}
            hint={
              falsePositives > 0
                ? 'Considere ajustar las reglas que los generan'
                : undefined
            }
          />
        </section>

        <IncidentQueue incidents={incidents} canReview={canReview} />
      </div>
    </>
  )
}
