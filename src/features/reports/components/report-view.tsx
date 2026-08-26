'use client'

import { useMemo } from 'react'
import { Download, Printer } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import {
  CHANNEL_LABEL,
  ENFORCEMENT_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  ruleLabel,
} from '@/features/incidents/types/incidents'
import type { IncidentSeverity, IncidentStatus } from '@/shared/types/database'
import { toCSV, downloadCSV } from '../lib/csv'

export interface ReportIncident {
  id: string
  rule_triggered: string
  rule_channel: string | null
  severity: IncidentSeverity
  status: IncidentStatus
  classification: string | null
  enforcement_action: string | null
  detected_at: string
  hostname: string
  user: string
  occurrences: number
}

const SEVERITY_ORDER: IncidentSeverity[] = ['critical', 'high', 'medium', 'low']

/** Cuenta ocurrencias de una clave y devuelve pares [clave, n] ordenados desc. */
function tally<T extends string>(items: T[]): [T, number][] {
  const m = new Map<T, number>()
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export function ReportView({
  orgName,
  from,
  to,
  generatedAt,
  incidents,
}: {
  orgName: string
  from: string
  to: string
  generatedAt: string
  incidents: ReportIncident[]
}) {
  const stats = useMemo(() => {
    const bySeverity = new Map<IncidentSeverity, number>()
    for (const i of incidents) bySeverity.set(i.severity, (bySeverity.get(i.severity) ?? 0) + 1)
    const open = incidents.filter((i) => i.status === 'open').length
    const byChannel = tally(incidents.map((i) => i.rule_channel ?? 'otro'))
    const byRule = tally(incidents.map((i) => i.rule_triggered))
    const byClass = tally(incidents.filter((i) => i.classification).map((i) => i.classification as string))
    const byUser = tally(incidents.map((i) => i.user || '—')).slice(0, 10)
    return { bySeverity, open, byChannel, byRule, byClass, byUser }
  }, [incidents])

  function exportCSV() {
    const csv = toCSV(
      incidents.map((i) => ({
        detectado: formatDateTime(i.detected_at),
        equipo: i.hostname,
        usuario: i.user,
        regla: ruleLabel(i.rule_triggered),
        canal: CHANNEL_LABEL[i.rule_channel ?? ''] ?? i.rule_channel ?? '',
        clasificacion: i.classification ?? '',
        severidad: SEVERITY_LABEL[i.severity],
        estado: STATUS_LABEL[i.status],
        accion: ENFORCEMENT_LABEL[i.enforcement_action ?? ''] ?? i.enforcement_action ?? '',
        ocurrencias: i.occurrences,
      })),
      [
        { key: 'detectado', header: 'Detectado' },
        { key: 'equipo', header: 'Equipo' },
        { key: 'usuario', header: 'Usuario' },
        { key: 'regla', header: 'Regla' },
        { key: 'canal', header: 'Canal' },
        { key: 'clasificacion', header: 'Clasificacion' },
        { key: 'severidad', header: 'Severidad' },
        { key: 'estado', header: 'Estado' },
        { key: 'accion', header: 'Accion' },
        { key: 'ocurrencias', header: 'Ocurrencias' },
      ],
    )
    downloadCSV(`nortis-incidentes-${from}_${to}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* Barra de acciones: se oculta al imprimir para que el PDF sea limpio. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          {incidents.length.toLocaleString('es-CO')} incidentes en el periodo
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCSV} disabled={incidents.length === 0}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            Exportar CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Cabecera del reporte, visible tambien en el PDF. */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold tracking-tight">Reporte de incidentes de fuga de datos</h2>
        <dl className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Organizacion</dt>
            <dd className="font-medium">{orgName}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Generado</dt>
            <dd className="font-medium tabular-nums">{formatDateTime(generatedAt)}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Periodo</dt>
            <dd className="font-medium tabular-nums">
              {from} a {to}
            </dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-muted-foreground">Total incidentes</dt>
            <dd className="font-medium tabular-nums">
              {incidents.length} ({stats.open} abiertos)
            </dd>
          </div>
        </dl>
      </div>

      {/* Resumen por severidad. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SEVERITY_ORDER.map((sev) => (
          <Card key={sev}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{SEVERITY_LABEL[sev]}</span>
                <Badge tone={SEVERITY_TONE[sev]}>{stats.bySeverity.get(sev) ?? 0}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryTable
          title="Por regla"
          rows={stats.byRule.map(([k, n]) => [ruleLabel(k), n])}
        />
        <SummaryTable
          title="Por canal"
          rows={stats.byChannel.map(([k, n]) => [CHANNEL_LABEL[k] ?? k, n])}
        />
        <SummaryTable
          title="Por clasificacion de dato"
          rows={stats.byClass.length ? stats.byClass : [['(sin clasificacion)', incidents.length]]}
        />
        <SummaryTable title="Usuarios con mas incidentes" rows={stats.byUser} />
      </div>
    </div>
  )
}

function SummaryTable({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 pb-4 text-xs text-muted-foreground">Sin datos</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(([label, n]) => (
              <li key={label} className="flex items-center justify-between px-5 py-2 text-sm">
                <span className="min-w-0 truncate pr-3">{label}</span>
                <span className="tabular-nums text-muted-foreground">{n.toLocaleString('es-CO')}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
