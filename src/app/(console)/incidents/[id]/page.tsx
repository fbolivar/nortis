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
  QuarantineActions,
  type QuarantinedFile,
} from '@/features/incidents/components/quarantine-actions'
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

/** Lee un valor anidado string del snapshot (p. ej. window.from) sin confiar en su forma. */
function nested(snapshot: unknown, outer: string, inner: string): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const o = (snapshot as Record<string, unknown>)[outer]
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const value = (o as Record<string, unknown>)[inner]
  return typeof value === 'string' ? value : null
}

/**
 * Reune los archivos que el agente retiro a cuarentena para este incidente. Los
 * datos concretos —identificador de cuarentena y ruta original— viven en los
 * eventos de la ventana del incidente, no en su snapshot agregado. A cada archivo
 * se le adjunta el estado del ultimo comando que la consola le encargo, para que
 * el revisor vea si una restauracion ya esta en marcha o fallo.
 */
async function loadQuarantineFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  incident: {
    endpoint_id: string
    enforcement_action: string | null
    event_snapshot: unknown
  },
): Promise<QuarantinedFile[]> {
  if (incident.enforcement_action !== 'quarantine') return []

  const from = nested(incident.event_snapshot, 'window', 'from')
  const to = nested(incident.event_snapshot, 'window', 'to')

  let query = supabase
    .from('activity_events')
    .select('payload, occurred_at')
    .eq('endpoint_id', incident.endpoint_id)
    .in('event_type', ['file_created', 'file_modified'])
    .not('payload->>quarantine_id', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(50)
  if (from) query = query.gte('occurred_at', from)
  if (to) query = query.lte('occurred_at', to)

  const { data: events } = await query
  if (!events || events.length === 0) return []

  // Un mismo archivo puede figurar en varios eventos (creado y luego modificado):
  // se conserva el mas reciente por identificador de cuarentena.
  const porId = new Map<string, { originalPath: string; occurredAt: string }>()
  for (const e of events) {
    const payload = e.payload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
    const p = payload as Record<string, unknown>
    const qid = p.quarantine_id
    if (typeof qid !== 'string' || !qid || porId.has(qid)) continue
    porId.set(qid, {
      originalPath: typeof p.path === 'string' ? p.path : '(ruta desconocida)',
      occurredAt: e.occurred_at,
    })
  }
  if (porId.size === 0) return []

  const { data: commands } = await supabase
    .from('agent_commands')
    .select('quarantine_id, kind, status, error')
    .eq('endpoint_id', incident.endpoint_id)
    .in('quarantine_id', [...porId.keys()])
    .order('created_at', { ascending: false })

  const ultimo = new Map<string, NonNullable<typeof commands>[number]>()
  for (const c of commands ?? []) {
    if (!ultimo.has(c.quarantine_id)) ultimo.set(c.quarantine_id, c)
  }

  return [...porId.entries()].map(([quarantineId, f]) => {
    const cmd = ultimo.get(quarantineId)
    return {
      quarantineId,
      originalPath: f.originalPath,
      occurredAt: f.occurredAt,
      commandKind: cmd?.kind ?? null,
      commandStatus: cmd?.status ?? null,
      commandError: cmd?.error ?? null,
    }
  })
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

  // Cuando el agente retiro documentos a cuarentena, se ofrece restaurarlos o
  // borrarlos. Los archivos concretos —con su identificador de cuarentena— estan
  // en los eventos, no en el snapshot agregado del incidente: se leen de la
  // ventana temporal del incidente, y a cada uno se le adjunta el estado del
  // ultimo comando que se le encargo (si hubo alguno).
  const quarantineFiles = await loadQuarantineFiles(supabase, incident)

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
            {incident.classification ? (
              <Badge tone="neutral">Dato: {incident.classification}</Badge>
            ) : null}
            <Link
              href="/incidents"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Volver a la cola
            </Link>
          </>
        }
      />

      <div className="page-body space-y-6">
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
              {incident.classification ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Clasificacion del dato</dt>
                  <dd className="mt-0.5 text-sm font-medium">{incident.classification}</dd>
                </div>
              ) : null}
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

        {quarantineFiles.length > 0 ? (
          <QuarantineActions
            endpointId={incident.endpoint_id}
            files={quarantineFiles}
            canReview={canReview}
          />
        ) : null}

        <IncidentReview
          incident={incident}
          reviewerEmail={reviewer?.email ?? null}
          canReview={canReview}
        />
      </div>
    </>
  )
}
