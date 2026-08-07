import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { StatTile } from '@/shared/components/stat-tile'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import { IncidentReview } from '@/features/incidents/components/incident-review'
import {
  CHANNEL_LABEL,
  ENFORCEMENT_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  ruleLabel,
} from '@/features/incidents/types/incidents'

/** Lee un campo del snapshot sin confiar en su forma. */
function field(snapshot: unknown, key: string): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>)[key]
  if (value == null) return null
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const session = await getSessionContext()

  const { data: incident } = await supabase
    .from('dlp_incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!incident) notFound()

  const [{ data: endpoint }, { data: reviewer }] = await Promise.all([
    supabase
      .from('endpoints')
      .select('id, hostname, last_logged_user, os_version')
      .eq('id', incident.endpoint_id)
      .maybeSingle(),
    incident.reviewed_by
      ? supabase.from('users').select('email').eq('id', incident.reviewed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const canReview = session?.role === 'owner' || session?.role === 'admin'
  const occurrences = field(incident.event_snapshot, 'occurrences')
  const sample = field(incident.event_snapshot, 'sample')
  const actor = field(incident.event_snapshot, 'user')

  return (
    <>
      <PageHeader
        title={ruleLabel(incident.rule_triggered)}
        description={`${CHANNEL_LABEL[incident.rule_channel ?? ''] ?? incident.rule_channel ?? 'Sin canal'} · ${endpoint?.hostname ?? 'equipo desconocido'}`}
        actions={
          <>
            <Badge tone={SEVERITY_TONE[incident.severity]}>
              {SEVERITY_LABEL[incident.severity]}
            </Badge>
            <Link
              href="/incidents"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Volver a la cola
            </Link>
          </>
        }
      />

      <div className="space-y-5 p-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Ocurrencias" value={occurrences ?? '1'} />
          <StatTile
            label="Accion del agente"
            value={ENFORCEMENT_LABEL[incident.enforcement_action ?? ''] ?? '—'}
            hint={
              incident.enforcement_action === 'allowed' ||
              incident.enforcement_action === 'log'
                ? 'La accion se completo'
                : 'La accion se impidio'
            }
            tone={
              incident.enforcement_action === 'allowed' ||
              incident.enforcement_action === 'log'
                ? 'warning'
                : 'neutral'
            }
          />
          <StatTile label="Usuario" value={actor ?? '—'} />
          <StatTile label="Detectado" value={formatDateTime(incident.detected_at)} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Evidencia</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Muestra</dt>
                <dd className="forensic mt-0.5 break-all">{sample ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Regla</dt>
                <dd className="forensic mt-0.5">{incident.rule_triggered}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Momento del evento</dt>
                <dd className="mt-0.5 text-sm tabular-nums">
                  {formatDateTime(incident.event_occurred_at)}
                </dd>
              </div>
            </dl>

            {/*
              El snapshot completo se muestra crudo: es la evidencia tal como
              quedo registrada. Presentarlo interpretado y sin acceso al original
              obligaria a confiar en la interpretacion de la consola, que es
              justo lo que una auditoria no puede hacer.
            */}
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Ver registro completo
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-surface-muted p-3 text-xs">
                {JSON.stringify(incident.event_snapshot, null, 2)}
              </pre>
            </details>

            {endpoint ? (
              <p className="mt-4 text-xs text-muted-foreground">
                <Link
                  href={`/endpoints/${endpoint.id}`}
                  className="text-foreground underline underline-offset-2"
                >
                  Ver linea de tiempo de {endpoint.hostname}
                </Link>{' '}
                para el detalle evento por evento.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <IncidentReview
          incident={incident}
          reviewerEmail={reviewer?.email ?? null}
          canReview={canReview}
        />
      </div>
    </>
  )
}
