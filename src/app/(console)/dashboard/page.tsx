import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
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
import { ConnectedDevices } from '@/features/telemetry/components/connected-devices'
import { ProtectionCard, type ProtectionItem } from '@/features/dashboard/components/protection-card'

/** Titulo de seccion del panel. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight text-foreground">{children}</h2>
}

/** Un equipo sin señal en 15 minutos se considera fuera de linea. */
const OFFLINE_THRESHOLD_MIN = 15

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
    byDay,
    byHour,
    byCategory,
    topApps,
    topDomains,
    connectedUsb,
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
        'id, rule_triggered, rule_channel, severity, status, enforcement_action, detected_at, endpoints(hostname)'
      )
      .order('detected_at', { ascending: false })
      .limit(12),
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
  ])

  const totalEndpoints = endpoints.count ?? 0
  const onlineCount = online.count ?? 0
  const offlineCount = Math.max(0, totalEndpoints - onlineCount)
  const severeCount = severeOpen.count ?? 0
  const unassignedCount = unassigned.count ?? 0
  const recentIncidents = (recent.data ?? []) as unknown as SpotlightIncident[]

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
          Que sale, por donde y a que dispositivos externos. El reparto no es
          arbitrario: el donut y los dos rankings son listas cortas que se leen
          bien en un tercio, y los dispositivos externos son otra via de salida.
        */}
        <section className="space-y-3">
          <SectionTitle>Datos</SectionTitle>
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
          <ConnectedDevices rows={connectedUsb.data ?? []} />
        </section>

        {/* --------------------------------------------------- Comportamiento --- */}
        {/*
          Patrones de uso en el tiempo. Las series necesitan ancho: una linea de
          14 puntos en un tercio de pantalla convierte variaciones reales en
          dientes de sierra.
        */}
        <section className="space-y-3">
          <SectionTitle>Comportamiento</SectionTitle>
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <ActivityByDayChart data={byDay.data ?? []} />
            <ActivityByHourChart data={byHour.data ?? []} delay={60} />
          </div>
        </section>
      </div>
    </>
  )
}
