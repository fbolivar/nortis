import Link from 'next/link'
import { Radar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/shared/components/ui'
import { formatRelative } from '@/lib/utils'

/* ------------------------------------------------ Acciones remotas ---------- */

const KIND_LABEL: Record<string, string> = {
  install_msi: 'Instalar MSI',
  push_file: 'Colocar archivo',
  restart: 'Reiniciar',
  run_script: 'Ejecutar script',
  lock: 'Bloquear',
  wipe: 'Borrar datos',
  screenshot: 'Captura',
  message: 'Aviso',
  kill: 'Cerrar proceso',
  uninstall: 'Desinstalar',
  wake: 'Encender (WOL)',
  schedule_script: 'Script recurrente',
  scan_av: 'Escaneo antivirus',
  refresh_inventory: 'Actualizar inventario',
  account_action: 'Accion de cuenta',
  harden: 'Endurecer',
  network_isolate: 'Contener en la LAN',
}

const STATUS_TONE: Record<string, 'success' | 'critical' | 'warning' | 'neutral'> = {
  done: 'success',
  failed: 'critical',
  running: 'warning',
  sent: 'warning',
  pending: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  done: 'Hecha',
  failed: 'Fallo',
  running: 'En curso',
  sent: 'Enviada',
  pending: 'Pendiente',
}

export interface RecentTask {
  id: string
  kind: string
  status: string
  hostname: string
  createdAt: string
}

export function RemoteActionsPanel({
  summary,
  recent,
}: {
  summary: { done: number; failed: number; inflight: number }
  recent: RecentTask[]
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Acciones remotas</CardTitle>
        <Link href="/tasks" className="text-xs font-medium text-primary hover:underline">
          Despliegue
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-success-subtle py-2">
            <div className="text-lg font-semibold tabular-nums text-success">{summary.done}</div>
            <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Hechas</div>
          </div>
          <div className="rounded-lg bg-warning-subtle py-2">
            <div className="text-lg font-semibold tabular-nums text-warning">{summary.inflight}</div>
            <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">En curso</div>
          </div>
          <div className="rounded-lg bg-critical-subtle py-2">
            <div className="text-lg font-semibold tabular-nums text-critical">{summary.failed}</div>
            <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Fallidas</div>
          </div>
        </div>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aun no se han encargado acciones remotas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {KIND_LABEL[t.kind] ?? t.kind}
                  <span className="text-muted-foreground"> · {t.hostname}</span>
                </span>
                <span className="shrink-0 text-[0.65rem] tabular-nums text-faint">
                  {formatRelative(t.createdAt)}
                </span>
                <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------ Versiones del agente ------ */

export interface VersionSlice {
  version: string
  count: number
  current: boolean
}

export function AgentVersions({
  dist,
  upToDate,
  total,
}: {
  dist: VersionSlice[]
  upToDate: number
  total: number
}) {
  const outdated = Math.max(0, total - upToDate)
  const max = Math.max(1, ...dist.map((v) => v.count))
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Versiones del agente</CardTitle>
        <Link href="/updates" className="text-xs font-medium text-primary hover:underline">
          Actualizaciones
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-sm">
          <span className="font-semibold tabular-nums text-success">{upToDate}</span> al dia
          {outdated > 0 ? (
            <>
              {' · '}
              <span className="font-semibold tabular-nums text-warning">{outdated}</span> por
              actualizar
            </>
          ) : null}
        </p>
        <ul className="space-y-2">
          {dist.slice(0, 6).map((v) => (
            <li key={v.version} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 font-mono tabular-nums">{v.version}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={v.current ? 'block h-full bg-success' : 'block h-full bg-warning'}
                  style={{ width: `${(v.count / max) * 100}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                {v.count}
              </span>
              {v.current ? <Badge tone="success">actual</Badge> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------ Descubrimiento de red ----- */

export function NetworkDiscovery({ unmanaged }: { unmanaged: number }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-sm">Descubrimiento de red</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center gap-2 text-center">
        <Radar
          className={unmanaged > 0 ? 'mx-auto h-8 w-8 text-warning' : 'mx-auto h-8 w-8 text-success'}
          aria-hidden
        />
        <div className={`text-3xl font-semibold tabular-nums ${unmanaged > 0 ? 'text-warning' : 'text-success'}`}>
          {unmanaged}
        </div>
        <p className="text-xs text-muted-foreground">
          {unmanaged > 0
            ? 'dispositivos vistos en la red que NO tienen agente Nortis (shadow IT).'
            : 'Todos los vecinos de red vistos son equipos gestionados.'}
        </p>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------ Incidentes por canal ------ */

const CHANNEL_BAR = 'var(--chart-1)'

export function IncidentsByChannel({ data }: { data: { type: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-sm">Incidentes por canal</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">Abiertos, ultimos 30 dias</p>
      </CardHeader>
      <CardContent className="flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin incidentes abiertos.</p>
        ) : (
          <ul className="space-y-2.5">
            {data.map((d) => (
              <li key={d.type} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 truncate text-muted-foreground">{d.type}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(d.count / max) * 100}%`, background: CHANNEL_BAR }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right font-medium tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
