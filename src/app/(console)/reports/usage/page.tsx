import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/shared/components/console-shell'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import type { Json } from '@/shared/types/database'

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function parseDay(v: string | undefined, fb: string): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fb
}
function field(p: Json, k: string): string | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const v = (p as Record<string, unknown>)[k]
  return typeof v === 'string' ? v : null
}

export default async function UsageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const now = new Date()
  const to = parseDay(sp.to, isoDay(now))
  const from = parseDay(sp.from, isoDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)))
  const fromStart = `${from}T00:00:00.000Z`
  const toEnd = `${to}T23:59:59.999Z`

  const supabase = await createClient()
  const [{ data: logons }, { data: apps }] = await Promise.all([
    supabase
      .from('activity_events')
      .select('payload, occurred_at')
      .in('event_type', ['logon', 'logoff'])
      .gte('occurred_at', fromStart)
      .lte('occurred_at', toEnd)
      .limit(5000),
    supabase
      .from('activity_events')
      .select('payload')
      .eq('event_type', 'app_open')
      .gte('occurred_at', fromStart)
      .lte('occurred_at', toEnd)
      .limit(8000),
  ])

  // Actividad por usuario: cuantos inicios de sesion y su primera/ultima señal.
  const porUsuario = new Map<string, { logons: number; primero: string; ultimo: string }>()
  for (const e of logons ?? []) {
    const user = field(e.payload, 'user') ?? '—'
    const cur = porUsuario.get(user)
    if (!cur) {
      porUsuario.set(user, { logons: 1, primero: e.occurred_at, ultimo: e.occurred_at })
    } else {
      cur.logons += 1
      if (e.occurred_at < cur.primero) cur.primero = e.occurred_at
      if (e.occurred_at > cur.ultimo) cur.ultimo = e.occurred_at
    }
  }
  const usuarios = [...porUsuario.entries()].sort((a, b) => b[1].logons - a[1].logons)

  const porApp = new Map<string, number>()
  for (const e of apps ?? []) {
    const app = field(e.payload, 'app') ?? '—'
    porApp.set(app, (porApp.get(app) ?? 0) + 1)
  }
  const topApps = [...porApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)

  return (
    <>
      <PageHeader
        title="Tiempo de uso"
        description="Inicios de sesion por usuario y aplicaciones mas abiertas en el periodo"
      />
      <div className="page-body space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
              <input type="date" name="from" defaultValue={from} max={to}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
              <input type="date" name="to" defaultValue={to} max={isoDay(now)}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary" />
            </label>
            <button type="submit"
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Aplicar
            </button>
          </form>
          <Link href="/reports" className="text-xs text-primary underline-offset-2 hover:underline">
            Ver reporte de incidentes
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Actividad por usuario</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {usuarios.length === 0 ? (
                <div className="p-2">
                  <EmptyState title="Sin inicios de sesion" description="No hay eventos de sesion en el periodo." />
                </div>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Usuario</Th>
                      <Th>Inicios</Th>
                      <Th>Primera señal</Th>
                      <Th>Ultima señal</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map(([user, u]) => (
                      <tr key={user} className="hover:bg-surface-muted">
                        <Td className="font-medium">{user}</Td>
                        <Td className="tabular-nums text-muted-foreground">{u.logons}</Td>
                        <Td className="tabular-nums text-muted-foreground">{formatDateTime(u.primero)}</Td>
                        <Td className="tabular-nums text-muted-foreground">{formatDateTime(u.ultimo)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aplicaciones mas abiertas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {topApps.length === 0 ? (
                <div className="p-2">
                  <EmptyState title="Sin aperturas registradas" description="No hay eventos de aplicaciones en el periodo." />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {topApps.map(([app, n]) => (
                    <li key={app} className="flex items-center justify-between px-5 py-2 text-sm">
                      <span className="min-w-0 truncate pr-3">{app}</span>
                      <span className="tabular-nums text-muted-foreground">{n.toLocaleString('es-CO')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
