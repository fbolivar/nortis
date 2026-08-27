import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { Button, Callout } from '@/shared/components/ui'
import { StatTile } from '@/shared/components/stat-tile'
import { offlineCutoffISO } from '@/lib/utils'
import {
  ActivityByDayChart,
  ActivityByHourChart,
  CategoryDonutChart,
  RankingChart,
} from '@/features/telemetry/components/charts'
import {
  IncidentSpotlight,
  type SpotlightIncident,
} from '@/features/incidents/components/incident-spotlight'
import { ConnectedDevices } from '@/features/telemetry/components/connected-devices'
import { ProtectionCard, type ProtectionItem } from '@/features/dashboard/components/protection-card'
import {
  OpenInsightsDonut,
  IncidentsOverTimeChart,
} from '@/features/dashboard/components/insights-charts'
import { UsersByIncidents } from '@/features/dashboard/components/users-by-incidents'
import { ruleLabel } from '@/features/incidents/types/incidents'
import { ClassificationBars } from '@/features/classification/components/classification-bars'
import { classifyPath, type Classification } from '@/features/classification/lib/classify'

/** Titulo de seccion del panel. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight text-foreground">{children}</h2>
}

/** Un equipo sin señal en 15 minutos se considera fuera de linea. */
const OFFLINE_THRESHOLD_MIN = 15

/** Dias que cubren las agregaciones de incidentes del panel. */
const INSIGHT_DAYS = 30

/** Lee el usuario (actor) del snapshot de un incidente sin confiar en su forma. */
function incidentActor(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>).user
  return typeof value === 'string' && value.trim() ? value : null
}

type IncidentRow = {
  rule_triggered: string
  status: string
  detected_at: string
  event_snapshot: unknown
}

/** Incidentes abiertos agrupados por tipo de regla, para la dona. */
function openByType(rows: IncidentRow[]): { type: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (r.status !== 'open') continue
    const key = ruleLabel(r.rule_triggered)
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return [...m.entries()].map(([type, count]) => ({ type, count }))
}

/** Incidentes por dia (rellenando huecos con cero) para la barra en el tiempo. */
function incidentsPerDay(rows: IncidentRow[], days = INSIGHT_DAYS): { label: string; count: number }[] {
  const buckets = new Map<string, number>()
  const today = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - i)
    buckets.set(day.toISOString().slice(0, 10), 0)
  }
  for (const r of rows) {
    const key = r.detected_at.slice(0, 10)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return [...buckets.entries()].map(([iso, count]) => ({
    label: new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
    count,
  }))
}

/** Top usuarios por numero de incidentes atribuidos. */
function usersByIncidents(rows: IncidentRow[], limit = 6): { user: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const user = incidentActor(r.event_snapshot)
    if (user) m.set(user, (m.get(user) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** Operaciones de archivo agrupadas por clasificacion de dato (por patron). */
function fileOpsByClassification(
  rows: { payload: unknown }[],
  classifications: Classification[],
): { name: string; color: string; count: number }[] {
  const byName = new Map(classifications.map((c) => [c.name, c.color]))
  const m = new Map<string, { color: string; count: number }>()
  for (const r of rows) {
    const p = r.payload
    const obj = p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null
    if (!obj) continue
    // El agente etiqueta por CONTENIDO (Fase B); esa etiqueta manda. Si no viene,
    // se clasifica por la ruta (Fase A).
    const tagged = typeof obj.classification === 'string' ? obj.classification : null
    const path = typeof obj.path === 'string' ? obj.path : null
    const c = tagged
      ? { name: tagged, color: byName.get(tagged) ?? '#94a3b8' }
      : path
        ? classifyPath(path, classifications)
        : null
    if (!c) continue
    const cur = m.get(c.name)
    if (cur) cur.count += 1
    else m.set(c.name, { color: c.color, count: 1 })
  }
  return [...m.entries()].map(([name, v]) => ({ name, color: v.color, count: v.count }))
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  const staleSince = offlineCutoffISO(OFFLINE_THRESHOLD_MIN)

  const [
    endpoints,
    online,
    severeOpen,
    unassigned,
    currentRelease,
    recent,
    incidents30d,
    byDay,
    byHour,
    byCategory,
    topApps,
    topDomains,
    connectedUsb,
    classifications,
    fileEvents,
  ] = await Promise.all([
    // `select('id')` y no `select('*')` en los conteos: `authenticated` no tiene
    // permiso sobre agent_credential_hash, y pedir la tabla entera —aunque sea
    // solo para contar— falla con un error de permisos que no dice que columna
    // lo provoco.
    supabase.from('endpoints').select('id', { count: 'exact', head: true }),
    supabase
      .from('endpoints')
      .select('id', { count: 'exact', head: true })
      .gte('last_seen_at', staleSince),
    // Severos = alta/critica y abiertos: son los que llevan a la primera accion.
    supabase
      .from('dlp_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .in('severity', ['high', 'critical']),
    supabase
      .from('endpoints')
      .select('id', { count: 'exact', head: true })
      .is('assigned_profile_id', null),
    // Version vigente del agente, para contar equipos desactualizados.
    supabase.rpc('current_agent_release'),
    // Sin filtro de estado: el panel maestro-detalle tiene su propia pestaña de
    // "Abiertos", y filtrar en la consulta dejaria esa pestaña sin alternativa.
    supabase
      .from('dlp_incidents')
      .select(
        'id, rule_triggered, rule_channel, severity, status, enforcement_action, detected_at, classification, endpoints(hostname)'
      )
      .order('detected_at', { ascending: false })
      .limit(12),
    // Incidentes de los ultimos 30 dias para las agregaciones del panel (dona por
    // tipo, evolucion en el tiempo y usuarios). Solo los campos que se agregan.
    supabase
      .from('dlp_incidents')
      .select('rule_triggered, status, detected_at, event_snapshot')
      .gte('detected_at', offlineCutoffISO(INSIGHT_DAYS * 24 * 60))
      .limit(5000),
    // Las agregaciones corren en Postgres (SECURITY INVOKER, asi que RLS acota
    // por organizacion). Traer los eventos crudos para contarlos en Node
    // funcionaria con datos de demo y se caeria con un cliente real.
    supabase.rpc('report_activity_by_day', { p_days: 14 }),
    supabase.rpc('report_activity_by_hour', { p_days: 7 }),
    supabase.rpc('report_usage_by_category', { p_days: 7 }),
    supabase.rpc('report_top_apps', { p_days: 7, p_limit: 8 }),
    supabase.rpc('report_top_domains', { p_days: 7, p_limit: 8 }),
    // Dispositivos externos conectados en los ultimos 30 dias (uno por serial).
    supabase.rpc('report_connected_usb', { p_days: 30 }),
    // Reglas de clasificacion y operaciones de archivo del periodo, para agrupar
    // los datos por clase. La clasificacion se computa en Node con las reglas.
    supabase.from('data_classifications').select('*'),
    supabase
      .from('activity_events')
      .select('payload')
      .in('event_type', ['file_created', 'file_modified', 'file_deleted'])
      .gte('occurred_at', offlineCutoffISO(INSIGHT_DAYS * 24 * 60))
      .limit(5000),
  ])

  const totalEndpoints = endpoints.count ?? 0
  const onlineCount = online.count ?? 0
  const offlineCount = Math.max(0, totalEndpoints - onlineCount)
  const severeCount = severeOpen.count ?? 0
  const unassignedCount = unassigned.count ?? 0
  const recentIncidents = (recent.data ?? []) as unknown as SpotlightIncident[]

  // Agregaciones de incidentes (30 dias) para Insights y Comportamiento.
  const incidentRows = (incidents30d.data ?? []) as unknown as IncidentRow[]
  const insightsByType = openByType(incidentRows)
  const insightsSeries = incidentsPerDay(incidentRows)
  const topUsersByIncidents = usersByIncidents(incidentRows)

  const classificationBars = fileOpsByClassification(
    fileEvents.data ?? [],
    (classifications.data ?? []) as Classification[],
  )

  const currentVersion = currentRelease.data?.[0]?.version ?? null

  // Equipos con el agente por debajo de la version vigente. Se cuenta aparte
  // porque necesita la version, que sale de otra consulta.
  let outdatedCount = 0
  if (currentVersion) {
    const { count } = await supabase
      .from('endpoints')
      .select('id', { count: 'exact', head: true })
      .not('agent_version', 'is', null)
      .neq('agent_version', currentVersion)
    outdatedCount = count ?? 0
  }

  const consentSigned = Boolean(session?.organization?.monitoring_consent_signed_at)

  // Acciones de la tarjeta "Fortalece tu proteccion", en orden de urgencia.
  const protectionItems: ProtectionItem[] = [
    {
      before: 'Tiene',
      count: severeCount,
      after: 'incidente(s) severo(s) abierto(s) que requieren revision.',
      href: '/incidents',
      action: 'Investigar',
      tone: 'critical',
    },
    {
      before: '',
      count: unassignedCount,
      after: `de ${totalEndpoints} equipos no tienen politica de DLP asignada.`,
      href: '/endpoints',
      action: 'Asignar politica',
      tone: 'warning',
    },
    {
      before: '',
      count: offlineCount,
      after: `de ${totalEndpoints} equipos estan fuera de linea y pueden no aplicar las politicas.`,
      href: '/endpoints',
      action: 'Revisar equipos',
      tone: 'warning',
    },
    {
      before: '',
      count: outdatedCount,
      after: `de ${totalEndpoints} equipos tienen el agente desactualizado.`,
      href: '/updates',
      action: 'Actualizar agentes',
      tone: 'warning',
    },
  ]

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

      <div className="page-body space-y-6">
        {/* Vistazo: cuatro cifras de igual tamaño, el estado de un golpe de vista
            antes del detalle. */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Equipos"
            value={totalEndpoints}
            hint={`${onlineCount} en linea`}
          />
          <StatTile
            label="Fuera de linea"
            value={offlineCount}
            tone={offlineCount > 0 ? 'warning' : 'success'}
            hint={`de ${totalEndpoints} equipos`}
          />
          <StatTile
            label="Incidentes severos"
            value={severeCount}
            tone={severeCount > 0 ? 'critical' : 'success'}
            hint="abiertos, alta o critica"
          />
          <StatTile
            label="Sin politica"
            value={unassignedCount}
            tone={unassignedCount > 0 ? 'warning' : 'success'}
            hint="equipos sin DLP asignado"
          />
        </section>

        {/* Fortalece tu proteccion: lo primero que se ve es lo primero que hay
            que hacer. */}
        <ProtectionCard items={protectionItems} />

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

        {/* ------------------------------------------------------ Incidentes --- */}
        <section className="space-y-3">
          <SectionTitle>Incidentes</SectionTitle>
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            <OpenInsightsDonut data={insightsByType} />
            <IncidentsOverTimeChart data={insightsSeries} />
          </div>
          <IncidentSpotlight
            incidents={recentIncidents}
            emptyTitle={
              totalEndpoints === 0 ? 'Aun no hay agentes reportando' : 'Sin incidentes registrados'
            }
            emptyDescription={
              totalEndpoints === 0
                ? 'Genere una credencial de agente e instale el paquete en el primer equipo para empezar a recibir telemetria.'
                : 'Ninguna politica de DLP se ha violado. Los incidentes aparecen aqui en cuanto un agente los detecta.'
            }
            emptyAction={
              totalEndpoints === 0 ? (
                <Link href="/settings/api-keys">
                  <Button size="sm">Generar credencial de agente</Button>
                </Link>
              ) : undefined
            }
          />
        </section>

        {/* ------------------------------------------------------------ Datos --- */}
        {/*
          Que sale y a que dispositivos externos. Los patrones por usuario/app/sitio
          viven en Comportamiento; aqui queda el reparto por categoria y la salida
          por dispositivos.
        */}
        <section className="space-y-3">
          <SectionTitle>Datos</SectionTitle>
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            <ClassificationBars data={classificationBars} />
            <CategoryDonutChart data={byCategory.data ?? []} delay={120} />
          </div>
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            <ActivityByDayChart data={byDay.data ?? []} delay={180} />
            <ConnectedDevices rows={connectedUsb.data ?? []} />
          </div>
        </section>

        {/* --------------------------------------------------- Comportamiento --- */}
        {/*
          La vista centrada en la persona: quien acumula incidentes, que
          aplicaciones y sitios se usan mas, y como se distribuye la actividad.
        */}
        <section className="space-y-3">
          <SectionTitle>Comportamiento</SectionTitle>
          <div className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <UsersByIncidents rows={topUsersByIncidents} />
            <RankingChart
              title="Aplicaciones mas usadas"
              description="Ultimos 7 dias"
              data={topApps.data ?? []}
              nameKey="app"
              unit="eventos"
              emptyTitle="Sin uso de aplicaciones registrado"
              emptyDescription="El agente reporta apertura y foco de ventana de cada proceso."
              delay={180}
            />
            <RankingChart
              title="Sitios mas visitados"
              description="Ultimos 7 dias"
              data={topDomains.data ?? []}
              nameKey="domain"
              unit="visitas"
              emptyTitle="Sin navegacion registrada"
              emptyDescription="Se registra el dominio, nunca la URL completa: la ruta y la query llevan identificadores y tokens."
              delay={240}
            />
          </div>
          <ActivityByHourChart data={byHour.data ?? []} delay={60} />
        </section>
      </div>
    </>
  )
}
