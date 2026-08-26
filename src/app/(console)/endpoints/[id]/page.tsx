import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/shared/components/console-shell'
import { StatTile } from '@/shared/components/stat-tile'
import {
  Badge,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { formatDateTime, formatRelative, nowMs } from '@/lib/utils'
import {
  EndpointStatusBadge,
  resolveLiveStatus,
} from '@/features/telemetry/components/endpoint-status'
import { EventTypeBadge, describeEvent } from '@/features/telemetry/components/event-row'
import { EventTypeFilter } from '@/features/telemetry/components/event-type-filter'
import { EndpointInventory } from '@/features/inventory/components/endpoint-inventory'
import { RemoteActions } from '@/features/tasks/components/remote-actions'
import { getSessionContext } from '@/features/auth/services/session'
import { EVENT_TYPE_LABEL, type TelemetryEventType } from '@/shared/schemas/telemetry'
import { ENDPOINT_COLUMNS, type EventType } from '@/shared/types/database'

const TIMELINE_LIMIT = 100

export default async function EndpointDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tipo?: string }>
}) {
  const { id } = await params
  const { tipo } = await searchParams
  const supabase = await createClient()
  const session = await getSessionContext()
  const canManage = session?.role === 'owner' || session?.role === 'admin'

  const { data: endpoint } = await supabase
    .from('endpoints')
    .select(`${ENDPOINT_COLUMNS}, hardware_info, inventory_at, public_ip, security_profiles(id, name)`)
    .eq('id', id)
    .maybeSingle()

  // RLS ya impide leer equipos de otro tenant: si no hay fila, para este usuario
  // el equipo sencillamente no existe. Un 404 no filtra si existe en otro tenant.
  if (!endpoint) notFound()

  const validType =
    tipo && tipo in EVENT_TYPE_LABEL ? (tipo as TelemetryEventType) : undefined

  let timelineQuery = supabase
    .from('activity_events')
    .select('id, event_type, payload, occurred_at, ingested_at')
    .eq('endpoint_id', id)
    .order('occurred_at', { ascending: false })
    .limit(TIMELINE_LIMIT)

  if (validType) {
    timelineQuery = timelineQuery.eq('event_type', validType)
  }

  const [
    { data: timeline },
    { count: totalEvents },
    { data: incidents },
    { data: software },
    { data: shots },
  ] = await Promise.all([
      timelineQuery,
      supabase
        .from('activity_events')
        .select('*', { count: 'exact', head: true })
        .eq('endpoint_id', id),
      supabase
        .from('dlp_incidents')
        .select('id, rule_triggered, severity, status, detected_at')
        .eq('endpoint_id', id)
        .order('detected_at', { ascending: false })
        .limit(5),
      supabase
        .from('endpoint_software')
        .select('name, version, publisher')
        .eq('endpoint_id', id)
        .order('name'),
      supabase
        .from('screenshots')
        .select('id, captured_at')
        .eq('endpoint_id', id)
        .order('captured_at', { ascending: false })
        .limit(12),
    ])

  const events = timeline ?? []
  const openIncidents = (incidents ?? []).filter((i) => i.status === 'open').length
  const profile = endpoint.security_profiles as { name: string } | null
  const liveStatus = resolveLiveStatus(endpoint, nowMs())

  return (
    <>
      <PageHeader
        title={endpoint.hostname}
        description={endpoint.os_version ?? 'Sistema desconocido'}
        actions={<EndpointStatusBadge status={liveStatus} />}
      />

      <div className="page-body space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Eventos registrados" value={totalEvents ?? 0} />
          <StatTile
            label="Incidentes abiertos"
            value={openIncidents}
            tone={openIncidents > 0 ? 'critical' : 'success'}
          />
          <StatTile label="Ultima señal" value={formatRelative(endpoint.last_seen_at)} />
          <StatTile label="Version del agente" value={endpoint.agent_version ?? '—'} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Identidad y politica</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Ultimo usuario</dt>
                <dd className="mt-0.5 text-sm">{endpoint.last_logged_user ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Perfil asignado</dt>
                <dd className="mt-0.5 text-sm">
                  {profile ? profile.name : <Badge tone="warning">Sin perfil</Badge>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Politica aplicada</dt>
                <dd className="mt-0.5 text-sm tabular-nums">
                  {formatDateTime(endpoint.policy_applied_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Instalado</dt>
                <dd className="mt-0.5 text-sm tabular-nums">
                  {formatDateTime(endpoint.enrolled_at)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Huella de maquina</dt>
                <dd className="forensic mt-0.5 break-all">{endpoint.machine_fingerprint}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <EndpointInventory
          hardware={endpoint.hardware_info}
          inventoryAt={endpoint.inventory_at}
          software={software ?? []}
          publicIp={endpoint.public_ip}
          endpointId={endpoint.id}
          canManage={canManage}
        />

        {(shots ?? []).length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Capturas de pantalla</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Monitoreo con consentimiento firmado. Se conservan las mas recientes. Haga clic para
                ver en tamaño completo.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {(shots ?? []).map((s) => (
                  <a
                    key={s.id}
                    href={`/api/screenshots/${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/screenshots/${s.id}`}
                      alt={`Captura ${formatDateTime(s.captured_at)}`}
                      className="aspect-video w-full bg-surface-muted object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <span className="block px-2 py-1 text-[0.65rem] tabular-nums text-muted-foreground">
                      {formatDateTime(s.captured_at)}
                    </span>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {canManage ? (
          <RemoteActions
            endpointId={endpoint.id}
            hostname={endpoint.hostname}
            consentSigned={Boolean(session?.organization?.monitoring_consent_signed_at)}
          />
        ) : null}

        {openIncidents > 0 ? (
          <Callout tone="critical" title="Este equipo tiene incidentes sin revisar">
            {(incidents ?? [])
              .filter((i) => i.status === 'open')
              .map((i) => (
                <p key={i.id} className="font-mono text-xs">
                  {i.rule_triggered} · {formatRelative(i.detected_at)}
                </p>
              ))}
          </Callout>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Linea de tiempo</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ultimos {TIMELINE_LIMIT} eventos
                  {validType ? ` de tipo "${EVENT_TYPE_LABEL[validType]}"` : ''}
                </p>
              </div>
              <EventTypeFilter basePath={`/endpoints/${id}`} selected={validType} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <EmptyState
                title={
                  validType
                    ? 'Sin eventos de ese tipo'
                    : 'Este equipo aun no ha reportado actividad'
                }
                description={
                  validType
                    ? 'Pruebe con otro tipo de evento o quite el filtro.'
                    : 'El agente esta registrado pero todavia no ha enviado telemetria.'
                }
                action={
                  validType ? (
                    <Link
                      href={`/endpoints/${id}`}
                      className="text-xs text-foreground underline underline-offset-2"
                    >
                      Quitar filtro
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Momento</Th>
                    <Th>Evento</Th>
                    <Th>Detalle</Th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-surface-muted">
                      <Td className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDateTime(event.occurred_at)}
                      </Td>
                      <Td>
                        <EventTypeBadge type={event.event_type as EventType} />
                      </Td>
                      <Td className="forensic max-w-xl truncate" title={describeEvent(event.event_type as EventType, event.payload)}>
                        {describeEvent(event.event_type as EventType, event.payload)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
