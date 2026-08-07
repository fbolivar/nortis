import Link from 'next/link'
import { MonitorSmartphone, ShieldAlert, ShieldOff, Wifi } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { StatTile } from '@/shared/components/stat-tile'
import { Button, Callout } from '@/shared/components/ui'
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

/** Un equipo sin señal en 15 minutos se considera fuera de linea. */
const OFFLINE_THRESHOLD_MIN = 15

const TREND_DAYS = 14

/**
 * Incidentes por dia para la mini-grafica de la tarjeta.
 *
 * Los huecos se rellenan con cero en vez de omitirse: una serie que solo dibuja
 * los dias con incidentes comprime el eje temporal y convierte una racha tranquila
 * en una linea que parece constante. Y no se reutiliza la serie de actividad
 * general para esta tarjeta: una linea que no corresponde al numero que tiene
 * encima es peor que no dibujar nada.
 */
function incidentsPerDay(rows: { detected_at: string }[] | null, days = TREND_DAYS): number[] {
  if (!rows?.length) return []

  const buckets = new Map<string, number>()
  const today = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - i)
    buckets.set(day.toISOString().slice(0, 10), 0)
  }

  for (const row of rows) {
    const key = row.detected_at.slice(0, 10)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return [...buckets.values()]
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
    incidentTrend,
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
    // Sin filtro de estado: el panel maestro-detalle tiene su propia pestaña de
    // "Abiertos", y filtrar en la consulta dejaria esa pestaña sin alternativa.
    supabase
      .from('dlp_incidents')
      .select(
        'id, rule_triggered, rule_channel, severity, status, enforcement_action, detected_at, endpoints(hostname)'
      )
      .order('detected_at', { ascending: false })
      .limit(12),
    // Solo la marca de tiempo: el conteo por dia se hace sobre 14 dias de
    // incidentes, que es un volumen de filas pequeño incluso en un tenant activo.
    supabase
      .from('dlp_incidents')
      .select('detected_at')
      .gte('detected_at', offlineCutoffISO(TREND_DAYS * 24 * 60))
      .limit(5000),
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
  const recentIncidents = (recent.data ?? []) as unknown as SpotlightIncident[]
  const incidentSeries = incidentsPerDay(incidentTrend.data)

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

      <div className="page-body space-y-4">
        {/*
          Dos columnas ya en telefono. Con la tarjeta compacta, una metrica por
          fila dejaba el resumen ocupando pantalla y media antes de llegar a los
          incidentes, que es lo que se viene a mirar.
        */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Equipos con agente"
            value={totalEndpoints}
            icon={MonitorSmartphone}
            hint={totalEndpoints === 0 ? 'Ninguno desplegado aun' : 'Inventario total'}
          />
          <StatTile
            delay={60}
            label="En linea"
            value={totalEndpoints === 0 ? '—' : `${onlineCount}/${totalEndpoints}`}
            icon={Wifi}
            hint={`Sin señal en ${OFFLINE_THRESHOLD_MIN} min = fuera de linea`}
            tone={totalEndpoints > 0 && onlineCount === 0 ? 'warning' : 'neutral'}
            delta={
              totalEndpoints > 0
                ? {
                    value: `${Math.round((onlineCount / totalEndpoints) * 100)}% del parque`,
                    direction: onlineCount === totalEndpoints ? 'flat' : 'down',
                    intent: onlineCount === totalEndpoints ? 'good' : 'neutral',
                  }
                : undefined
            }
          />
          <StatTile
            delay={120}
            label="Incidentes abiertos"
            value={incidentCount}
            icon={ShieldAlert}
            hint={incidentCount === 0 ? 'Nada pendiente de revisar' : 'Requieren revision'}
            tone={incidentCount > 0 ? 'critical' : 'success'}
            visual={
              incidentSeries.length
                ? {
                    data: incidentSeries,
                    kind: 'bars',
                    label: `Incidentes detectados por dia, ultimos ${TREND_DAYS} dias`,
                  }
                : undefined
            }
          />
          <StatTile
            delay={180}
            label="Equipos sin politica"
            value={unassignedCount}
            icon={ShieldOff}
            hint={
              unassignedCount > 0
                ? 'No tienen reglas de DLP aplicadas'
                : totalEndpoints === 0
                  ? '—'
                  : 'Cobertura completa'
            }
            tone={unassignedCount > 0 ? 'warning' : 'success'}
            delta={
              totalEndpoints > 0
                ? {
                    value: `${totalEndpoints - unassignedCount} de ${totalEndpoints} cubiertos`,
                    direction: unassignedCount === 0 ? 'up' : 'down',
                    intent: unassignedCount === 0 ? 'good' : 'bad',
                  }
                : undefined
            }
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

        {/*
          `items-start`: sin el, la rejilla estira cada tarjeta hasta la altura
          de la mas alta de su fila, y el donut —que ocupa la mitad— queda con un
          hueco blanco enorme debajo que se lee como contenido que falta.
        */}
        {/*
          Dos rejillas y no una de cinco huecos: 5 tarjetas en 2 o en 3 columnas
          dejan SIEMPRE un hueco al final de la ultima fila, y ese vacio al pie
          del panel se lee como una tarjeta que no cargo.

          El reparto ademas no es arbitrario. Las series temporales necesitan
          ancho —una linea de 14 puntos en un tercio de pantalla convierte las
          variaciones reales en dientes de sierra—, mientras que el donut y los
          dos rankings son listas cortas que se leen igual de bien en un tercio.
        */}
        <section className="grid items-start gap-3 lg:grid-cols-2">
          <ActivityByDayChart data={byDay.data ?? []} />
          <ActivityByHourChart data={byHour.data ?? []} delay={60} />
        </section>

        <section className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CategoryDonutChart data={byCategory.data ?? []} delay={120} />
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
        </section>

      </div>
    </>
  )
}
