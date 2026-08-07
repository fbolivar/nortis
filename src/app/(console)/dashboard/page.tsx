import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { StatTile } from '@/shared/components/stat-tile'
import {
  Badge,
  Button,
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
import { formatRelative, offlineCutoffISO } from '@/lib/utils'
import {
  ActivityByDayChart,
  ActivityByHourChart,
  CategoryDonutChart,
  RankingChart,
} from '@/features/telemetry/components/charts'
import type { IncidentSeverity } from '@/shared/types/database'

/** Un equipo sin señal en 15 minutos se considera fuera de linea. */
const OFFLINE_THRESHOLD_MIN = 15

const SEVERITY_TONE: Record<IncidentSeverity, 'critical' | 'warning' | 'info' | 'neutral'> = {
  critical: 'critical',
  high: 'critical',
  medium: 'warning',
  low: 'neutral',
}

const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  critical: 'Critica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  const staleSince = offlineCutoffISO(OFFLINE_THRESHOLD_MIN)

  const [
    endpoints,
    online,
    openIncidents,
    unassigned,
    recent,
    byDay,
    byHour,
    byCategory,
    topApps,
    topDomains,
  ] = await Promise.all([
    supabase.from('endpoints').select('*', { count: 'exact', head: true }),
    supabase
      .from('endpoints')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', staleSince),
    supabase
      .from('dlp_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open'),
    supabase
      .from('endpoints')
      .select('*', { count: 'exact', head: true })
      .is('assigned_profile_id', null),
    supabase
      .from('dlp_incidents')
      .select('id, rule_triggered, rule_channel, severity, detected_at, endpoint_id')
      .eq('status', 'open')
      .order('detected_at', { ascending: false })
      .limit(8),
    // Las agregaciones corren en Postgres (SECURITY INVOKER, asi que RLS acota
    // por organizacion). Traer los eventos crudos para contarlos en Node
    // funcionaria con datos de demo y se caeria con un cliente real.
    supabase.rpc('report_activity_by_day', { p_days: 14 }),
    supabase.rpc('report_activity_by_hour', { p_days: 7 }),
    supabase.rpc('report_usage_by_category', { p_days: 7 }),
    supabase.rpc('report_top_apps', { p_days: 7, p_limit: 8 }),
    supabase.rpc('report_top_domains', { p_days: 7, p_limit: 8 }),
  ])

  const totalEndpoints = endpoints.count ?? 0
  const onlineCount = online.count ?? 0
  const incidentCount = openIncidents.count ?? 0
  const unassignedCount = unassigned.count ?? 0
  const recentIncidents = recent.data ?? []

  const consentSigned = Boolean(session?.organization?.monitoring_consent_signed_at)

  return (
    <>
      <PageHeader
        title="Panel"
        description="Estado general de la organizacion"
        actions={
          <Link href="/settings/api-keys">
            <Button size="sm" variant="secondary">
              Desplegar agente
            </Button>
          </Link>
        }
      />

      <div className="space-y-5 p-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Equipos con agente"
            value={totalEndpoints}
            hint={totalEndpoints === 0 ? 'Ninguno desplegado aun' : undefined}
          />
          <StatTile
            label="En linea"
            value={totalEndpoints === 0 ? '—' : `${onlineCount}/${totalEndpoints}`}
            hint={`Sin señal en ${OFFLINE_THRESHOLD_MIN} min = fuera de linea`}
            tone={totalEndpoints > 0 && onlineCount === 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label="Incidentes abiertos"
            value={incidentCount}
            hint={incidentCount === 0 ? 'Nada pendiente de revisar' : 'Requieren revision'}
            tone={incidentCount > 0 ? 'critical' : 'success'}
          />
          <StatTile
            label="Equipos sin politica"
            value={unassignedCount}
            hint={
              unassignedCount > 0
                ? 'No tienen reglas de DLP aplicadas'
                : totalEndpoints === 0
                  ? '—'
                  : 'Cobertura completa'
            }
            tone={unassignedCount > 0 ? 'warning' : 'success'}
          />
        </section>

        {!consentSigned ? (
          <Callout tone="warning" title="Sin autorizacion de tratamiento de datos">
            El registro de titulos de ventana y la captura de pantalla estan{' '}
            <strong>bloqueados</strong> hasta registrar la autorizacion firmada de sus
            trabajadores (Ley 1581 de 2012). El resto del monitoreo funciona con
            normalidad.{' '}
            <Link href="/settings" className="text-foreground underline underline-offset-2">
              Registrar autorizacion
            </Link>
          </Callout>
        ) : null}

        <section className="grid gap-3 lg:grid-cols-2">
          <ActivityByDayChart data={byDay.data ?? []} />
          <ActivityByHourChart data={byHour.data ?? []} />
          <CategoryDonutChart data={byCategory.data ?? []} />
          <RankingChart
            title="Aplicaciones mas usadas"
            description="Ultimos 7 dias"
            data={topApps.data ?? []}
            nameKey="app"
            unit="eventos"
            emptyTitle="Sin uso de aplicaciones registrado"
            emptyDescription="El agente reporta apertura y foco de ventana de cada proceso."
          />
          <RankingChart
            title="Sitios mas visitados"
            description="Ultimos 7 dias"
            data={topDomains.data ?? []}
            nameKey="domain"
            unit="visitas"
            emptyTitle="Sin navegacion registrada"
            emptyDescription="Se registra el dominio, nunca la URL completa: la ruta y la query llevan identificadores y tokens."
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Incidentes recientes sin revisar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentIncidents.length === 0 ? (
              <EmptyState
                title={
                  totalEndpoints === 0
                    ? 'Aun no hay agentes reportando'
                    : 'Sin incidentes abiertos'
                }
                description={
                  totalEndpoints === 0
                    ? 'Genere una credencial de agente e instale el paquete en el primer equipo para empezar a recibir telemetria.'
                    : 'Ninguna politica de DLP se ha violado. Los incidentes aparecen aqui en cuanto un agente los detecta.'
                }
                action={
                  totalEndpoints === 0 ? (
                    <Link href="/settings/api-keys">
                      <Button size="sm">Generar credencial de agente</Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Regla</Th>
                    <Th>Canal</Th>
                    <Th>Severidad</Th>
                    <Th>Detectado</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentIncidents.map((incident) => (
                    <tr key={incident.id} className="hover:bg-surface-muted/50">
                      <Td className="font-mono text-xs">{incident.rule_triggered}</Td>
                      <Td className="text-muted-foreground">{incident.rule_channel ?? '—'}</Td>
                      <Td>
                        <Badge tone={SEVERITY_TONE[incident.severity]}>
                          {SEVERITY_LABEL[incident.severity]}
                        </Badge>
                      </Td>
                      <Td className="text-muted-foreground">
                        {formatRelative(incident.detected_at)}
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
