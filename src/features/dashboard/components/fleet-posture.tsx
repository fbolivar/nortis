import Link from 'next/link'
import { ShieldOff, Flame, Lock, Bug, RefreshCw, KeyRound, ArrowRight } from 'lucide-react'
import { Card } from '@/shared/components/ui'

export interface FleetPostureData {
  /** Equipos con inventario (los únicos que se puntúan). */
  scored: number
  avgScore: number | null
  ok: number
  warning: number
  critical: number
  noAntivirus: number
  firewallOff: number
  diskUnencrypted: number
  activeThreats: number
  pendingUpdates: number
  pendingExceptions: number
}

/** Un control de la flota: cuántos equipos lo incumplen y a dónde ir. */
function PostureItem({
  icon: Icon,
  count,
  label,
  href,
  critical = false,
}: {
  icon: typeof ShieldOff
  count: number
  label: string
  href: string
  critical?: boolean
}) {
  const bad = count > 0
  const tone = bad ? (critical ? 'critical' : 'warning') : 'ok'
  const cls = {
    critical: 'text-critical bg-critical-subtle',
    warning: 'text-warning bg-warning-subtle',
    ok: 'text-success bg-success-subtle',
  }[tone]
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-surface-muted"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${cls}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold leading-none tabular-nums">{count}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{label}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  )
}

/**
 * Postura de seguridad de toda la flota en un bloque: el puntaje medio de
 * cumplimiento, cómo se reparten los equipos y cuántos incumplen cada control
 * crítico. Es el diagnóstico de un vistazo — lo que un responsable quiere ver
 * al entrar.
 */
export function FleetPosture({ data: d }: { data: FleetPostureData }) {
  const total = Math.max(1, d.ok + d.warning + d.critical)
  const scoreTone =
    d.avgScore === null ? 'text-foreground'
    : d.avgScore >= 90 ? 'text-success'
    : d.avgScore >= 60 ? 'text-warning'
    : 'text-critical'

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* Cumplimiento */}
        <div className="flex flex-col gap-4 border-b border-border bg-surface-muted px-6 py-5 lg:border-b-0 lg:border-r">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Puntaje de cumplimiento</p>
              <p className={`mt-1 text-4xl font-semibold leading-none tabular-nums ${scoreTone}`}>
                {d.avgScore ?? '—'}
                <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
              </p>
            </div>
            <Link
              href="/reports/compliance"
              className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Detalle <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div>
            <div className="flex h-2.5 overflow-hidden rounded-full border border-border bg-surface">
              <span className="bg-success" style={{ width: `${(d.ok / total) * 100}%` }} />
              <span className="bg-warning" style={{ width: `${(d.warning / total) * 100}%` }} />
              <span className="bg-critical" style={{ width: `${(d.critical / total) * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> {d.ok} cumplen</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> {d.warning} en riesgo</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-critical" /> {d.critical} criticos</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sobre {d.scored} equipo{d.scored === 1 ? '' : 's'} con inventario reportado.
          </p>
        </div>

        {/* Brechas por control */}
        <div className="grid grid-cols-2 gap-2.5 p-5 sm:grid-cols-3">
          <PostureItem icon={Bug} count={d.activeThreats} label="Con amenazas activas" href="/reports/compliance" critical />
          <PostureItem icon={ShieldOff} count={d.noAntivirus} label="Sin antivirus" href="/reports/compliance" critical />
          <PostureItem icon={Lock} count={d.diskUnencrypted} label="Disco sin cifrar" href="/reports/compliance" critical />
          <PostureItem icon={Flame} count={d.firewallOff} label="Cortafuegos apagado" href="/reports/compliance" critical />
          <PostureItem icon={RefreshCw} count={d.pendingUpdates} label="Con parches pendientes" href="/reports/compliance" />
          <PostureItem icon={KeyRound} count={d.pendingExceptions} label="Excepciones por aprobar" href="/settings/exceptions" />
        </div>
      </div>
    </Card>
  )
}
