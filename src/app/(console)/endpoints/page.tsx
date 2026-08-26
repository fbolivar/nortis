import Link from 'next/link'
import { Clock, ShieldAlert, Wifi, WifiOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ENDPOINT_COLUMNS } from '@/shared/types/database'
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
import { formatRelative, nowMs } from '@/lib/utils'
import {
  EndpointStatusBadge,
  resolveLiveStatus,
  type LiveStatus,
} from '@/features/telemetry/components/endpoint-status'
import { getSessionContext } from '@/features/auth/services/session'
import { AgentInstallerButton } from '@/features/tenant/components/agent-installer-button'
import { readPosture, healthFlags } from '@/features/inventory/lib/posture'

export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>
}) {
  const { tag } = await searchParams
  const supabase = await createClient()
  const session = await getSessionContext()
  const canManage = session?.role === 'owner' || session?.role === 'admin'

  const { data, error } = await supabase
    .from('endpoints')
    .select(`${ENDPOINT_COLUMNS}, hardware_info, security_profiles(id, name)`)
    .order('hostname')

  if (error) {
    return (
      <>
        <PageHeader title="Equipos" description="Inventario de estaciones con agente" />
        <div className="page-body">
          <Callout tone="critical" title="No se pudo cargar el inventario">
            {error.message}
          </Callout>
        </div>
      </>
    )
  }

  const endpoints = data ?? []
  // Un solo reloj para toda la tabla: si cada fila leyera la hora por su cuenta,
  // dos equipos con el mismo last_seen_at podrian clasificarse distinto.
  const clock = nowMs()

  const statuses = endpoints.map((e) => resolveLiveStatus(e, clock))
  const count = (s: LiveStatus) => statuses.filter((x) => x === s).length
  const unassigned = endpoints.filter((e) => !e.assigned_profile_id).length
  const outdated = endpoints.filter(
    (e) => e.agent_version && e.agent_version !== latestAgentVersion(endpoints)
  ).length

  // Etiquetas: catalogo para el filtro y filtrado por la etiqueta activa.
  const allTags = [...new Set(endpoints.flatMap((e) => e.tags ?? []))].sort()
  const activeTag = tag && allTags.includes(tag) ? tag : undefined
  const shownEndpoints = activeTag
    ? endpoints.filter((e) => (e.tags ?? []).includes(activeTag))
    : endpoints

  // Postura/salud por equipo (del hardware reportado). Se cuenta como "con
  // alertas" el que tenga al menos un problema critico.
  const conAlertas = endpoints.filter(
    (e) => healthFlags(readPosture(e.hardware_info)).some((f) => f.tone === 'critical')
  ).length

  return (
    <>
      <PageHeader
        title="Equipos"
        description={`${endpoints.length} estaciones con agente instalado`}
        actions={
          canManage ? (
            <AgentInstallerButton />
          ) : (
            <Link href="/settings/api-keys">
              <Button size="sm" variant="secondary">
                Desplegar agente
              </Button>
            </Link>
          )
        }
      />

      <div className="page-body space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="En linea" value={count('online')} icon={Wifi} />
          <StatTile
            label="Sin señal reciente"
            value={count('stale')}
            icon={Clock}
            tone={count('stale') > 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label="Fuera de linea"
            value={count('offline')}
            icon={WifiOff}
            tone={count('offline') > 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label="En cuarentena"
            value={count('quarantined')}
            icon={ShieldAlert}
            tone={count('quarantined') > 0 ? 'critical' : 'neutral'}
          />
        </section>

        {conAlertas > 0 ? (
          <Callout
            tone="critical"
            title={`${conAlertas} ${conAlertas === 1 ? 'equipo con alertas de seguridad' : 'equipos con alertas de seguridad'}`}
          >
            Disco sin cifrar, antivirus o cortafuegos desactivados. Son riesgos directos de
            cumplimiento (Ley 1581); revisa la columna Salud y el detalle de cada equipo.
          </Callout>
        ) : null}

        {allTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar por etiqueta:</span>
            <Link
              href="/endpoints"
              className={
                'rounded-full px-3 py-1 text-xs transition-colors ' +
                (activeTag ? 'bg-muted text-muted-foreground hover:bg-muted/70' : 'bg-primary text-primary-foreground')
              }
            >
              Todos
            </Link>
            {allTags.map((t) => (
              <Link
                key={t}
                href={`/endpoints?tag=${encodeURIComponent(t)}`}
                className={
                  'rounded-full px-3 py-1 text-xs transition-colors ' +
                  (activeTag === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70')
                }
              >
                {t}
              </Link>
            ))}
          </div>
        ) : null}

        {unassigned > 0 || outdated > 0 ? (
          <Callout tone="warning" title="Brechas de cobertura">
            {unassigned > 0 ? (
              <p>
                <strong>{unassigned}</strong>{' '}
                {unassigned === 1 ? 'equipo no tiene' : 'equipos no tienen'} perfil de
                seguridad asignado: no se les aplica ninguna regla de DLP.
              </p>
            ) : null}
            {outdated > 0 ? (
              <p>
                <strong>{outdated}</strong>{' '}
                {outdated === 1 ? 'equipo ejecuta' : 'equipos ejecutan'} una version
                desactualizada del agente.
              </p>
            ) : null}
          </Callout>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Inventario</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {endpoints.length === 0 ? (
              <EmptyState
                title="Ningun equipo con agente"
                description="Descargue el instalador y ejecutelo en la primera estacion. Trae la credencial de enrolamiento y la clave de proteccion ya incluidas; el equipo aparecera aqui en cuanto se registre."
                action={
                  canManage ? (
                    <AgentInstallerButton size="md" variant="primary" />
                  ) : (
                    <Link href="/settings/api-keys">
                      <Button size="sm">Generar credencial</Button>
                    </Link>
                  )
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Equipo</Th>
                    <Th>Estado</Th>
                    <Th>Ultimo usuario</Th>
                    <Th>Perfil</Th>
                    <Th>Salud</Th>
                    <Th>Agente</Th>
                    <Th>Ultima señal</Th>
                  </tr>
                </thead>
                <tbody>
                  {shownEndpoints.map((endpoint) => {
                    const profile = endpoint.security_profiles as { name: string } | null
                    const status = resolveLiveStatus(endpoint, clock)
                    const problemas = healthFlags(readPosture(endpoint.hardware_info))
                    const criticos = problemas.filter((f) => f.tone === 'critical').length
                    return (
                      <tr key={endpoint.id} className="hover:bg-surface-muted">
                        <Td>
                          <Link
                            href={`/endpoints/${endpoint.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {endpoint.hostname}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {endpoint.os_version ?? 'Sistema desconocido'}
                          </span>
                          {(endpoint.tags ?? []).length > 0 ? (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {(endpoint.tags ?? []).map((t) => (
                                <span
                                  key={t}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground"
                                >
                                  {t}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </Td>
                        <Td>
                          <EndpointStatusBadge status={status} />
                        </Td>
                        <Td className="text-muted-foreground">
                          {endpoint.last_logged_user ?? '—'}
                        </Td>
                        <Td>
                          {profile ? (
                            <span className="text-muted-foreground">{profile.name}</span>
                          ) : (
                            <Badge tone="warning">Sin perfil</Badge>
                          )}
                        </Td>
                        <Td>
                          {problemas.length === 0 ? (
                            <Badge tone="success">OK</Badge>
                          ) : (
                            <Badge tone={criticos > 0 ? 'critical' : 'warning'} title={problemas.map((p) => p.label).join(', ')}>
                              {problemas.length} {problemas.length === 1 ? 'alerta' : 'alertas'}
                            </Badge>
                          )}
                        </Td>
                        <Td className="forensic">{endpoint.agent_version ?? '—'}</Td>
                        <Td className="text-muted-foreground">
                          {formatRelative(endpoint.last_seen_at)}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

/** Version mas alta observada en el parque. Sirve de referencia para "desactualizado". */
function latestAgentVersion(endpoints: { agent_version: string | null }[]): string | null {
  const versions = endpoints
    .map((e) => e.agent_version)
    .filter((v): v is string => Boolean(v))
    .sort((a, b) =>
      // Comparacion por componentes numericos: "0.9.2" no puede quedar por
      // encima de "1.0.0" solo porque "9" > "1" alfabeticamente.
      a.localeCompare(b, undefined, { numeric: true })
    )
  return versions.at(-1) ?? null
}
