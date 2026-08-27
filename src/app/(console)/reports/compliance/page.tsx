import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ENDPOINT_COLUMNS } from '@/shared/types/database'
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
import { formatRelative, nowMs } from '@/lib/utils'
import { resolveLiveStatus } from '@/features/telemetry/components/endpoint-status'
import { compliance, type ComplianceLevel } from '@/features/inventory/lib/posture'

const LEVEL_LABEL: Record<ComplianceLevel, string> = {
  ok: 'Cumple',
  warning: 'En riesgo',
  critical: 'Critico',
}

const LEVEL_TONE: Record<ComplianceLevel, 'success' | 'warning' | 'critical'> = {
  ok: 'success',
  warning: 'warning',
  critical: 'critical',
}

/**
 * Panel de cumplimiento de la flota. Reutiliza la postura de seguridad que ya
 * recolecta el agente para dar un puntaje por equipo y una vista agregada. Un
 * equipo sin datos de postura (aun no inventariado) se muestra como "sin datos"
 * y no cuenta como incumplimiento.
 */
export default async function CompliancePage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('endpoints')
    .select(`${ENDPOINT_COLUMNS}, hardware_info`)
    .order('hostname')

  if (error) {
    return (
      <>
        <PageHeader title="Cumplimiento" description="Postura de seguridad de la flota" />
        <div className="page-body">
          <Callout tone="critical" title="No se pudo cargar la flota">
            {error.message}
          </Callout>
        </div>
      </>
    )
  }

  const now = nowMs()
  const rows = (data ?? [])
    .map((e) => {
      const c = compliance(e.hardware_info)
      const hasData = e.hardware_info != null && Object.keys(e.hardware_info as object).length > 0
      return {
        id: e.id,
        hostname: e.hostname,
        lastSeen: e.last_seen_at,
        live: resolveLiveStatus(e, now),
        hasData,
        ...c,
      }
    })
    // Peores primero: menor puntaje arriba; los sin datos, al final.
    .sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
      return a.score - b.score
    })

  const conDatos = rows.filter((r) => r.hasData)
  const criticos = conDatos.filter((r) => r.level === 'critical').length
  const enRiesgo = conDatos.filter((r) => r.level === 'warning').length
  const cumplen = conDatos.filter((r) => r.level === 'ok').length
  const promedio =
    conDatos.length > 0
      ? Math.round(conDatos.reduce((s, r) => s + r.score, 0) / conDatos.length)
      : null

  return (
    <>
      <PageHeader
        title="Cumplimiento"
        description="Postura de seguridad de toda la flota, del equipo mas expuesto al que mas cumple"
      />

      <div className="page-body space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Puntaje promedio" value={promedio === null ? '—' : `${promedio}`} />
          <StatTile label="Criticos" value={criticos} tone={criticos > 0 ? 'critical' : 'success'} />
          <StatTile label="En riesgo" value={enRiesgo} tone={enRiesgo > 0 ? 'warning' : 'success'} />
          <StatTile label="Cumplen" value={cumplen} tone="success" />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Equipos</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState title="Sin equipos" description="Aun no hay estaciones con agente." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Equipo</Th>
                      <Th>Puntaje</Th>
                      <Th>Estado</Th>
                      <Th>Hallazgos</Th>
                      <Th>Ultima señal</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-muted">
                        <Td className="font-medium">
                          <Link href={`/endpoints/${r.id}`} className="hover:underline">
                            {r.hostname}
                          </Link>
                        </Td>
                        <Td className="tabular-nums">{r.hasData ? r.score : '—'}</Td>
                        <Td>
                          {r.hasData ? (
                            <Badge tone={LEVEL_TONE[r.level]}>{LEVEL_LABEL[r.level]}</Badge>
                          ) : (
                            <span className="text-muted-foreground">Sin datos</span>
                          )}
                        </Td>
                        <Td>
                          {r.flags.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              {r.hasData ? 'Todo en orden' : '—'}
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {r.flags.map((f, i) => (
                                <Badge
                                  key={`${f.label}-${i}`}
                                  tone={f.tone === 'critical' ? 'critical' : 'warning'}
                                >
                                  {f.label}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground tabular-nums">
                          {formatRelative(r.lastSeen)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
