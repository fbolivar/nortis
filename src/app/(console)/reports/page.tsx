import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { Callout } from '@/shared/components/ui'
import { ReportView, type ReportIncident } from '@/features/reports/components/report-view'
import type { Json } from '@/shared/types/database'

/** YYYY-MM-DD de una fecha. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Valida un YYYY-MM-DD; si no lo es, devuelve el fallback. */
function parseDay(value: string | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}

function field(snapshot: Json, key: string): string | number | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const v = (snapshot as Record<string, unknown>)[key]
  return typeof v === 'string' || typeof v === 'number' ? v : null
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const now = new Date()
  const defaultTo = isoDay(now)
  const defaultFrom = isoDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
  const from = parseDay(sp.from, defaultFrom)
  const to = parseDay(sp.to, defaultTo)

  const supabase = await createClient()
  const session = await getSessionContext()

  // El rango es inclusivo por dia: hasta el final del dia 'to'.
  const toEnd = `${to}T23:59:59.999Z`
  const fromStart = `${from}T00:00:00.000Z`

  const { data, error } = await supabase
    .from('dlp_incidents')
    .select(
      'id, rule_triggered, rule_channel, severity, status, classification, enforcement_action, detected_at, event_snapshot, endpoints(hostname)'
    )
    .gte('detected_at', fromStart)
    .lte('detected_at', toEnd)
    .order('detected_at', { ascending: false })
    .limit(5000)

  // El tipo generado no incluye la relacion FK dlp_incidents->endpoints, igual
  // que en la cola de incidentes: se castea por `unknown` para mapear.
  type Row = {
    id: string
    rule_triggered: string
    rule_channel: string | null
    severity: ReportIncident['severity']
    status: ReportIncident['status']
    classification: string | null
    enforcement_action: string | null
    detected_at: string
    event_snapshot: Json
    endpoints: { hostname: string } | null
  }
  const incidents: ReportIncident[] = ((data ?? []) as unknown as Row[]).map((i) => ({
    id: i.id,
    rule_triggered: i.rule_triggered,
    rule_channel: i.rule_channel,
    severity: i.severity,
    status: i.status,
    classification: i.classification,
    enforcement_action: i.enforcement_action,
    detected_at: i.detected_at,
    hostname: i.endpoints?.hostname ?? '—',
    user: (field(i.event_snapshot, 'user') as string) ?? '—',
    occurrences: (field(i.event_snapshot, 'occurrences') as number) ?? 1,
  }))

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Evidencia de incidentes de fuga de datos para auditoria y cumplimiento (Ley 1581)"
      />

      <div className="page-body space-y-6">
        {/* Selector de rango: form GET, sin JS. Recarga la pagina con el periodo. */}
        <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              max={to}
              className="rounded-lg border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              max={defaultTo}
              className="rounded-lg border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary"
            />
          </label>
          <button
            type="submit"
            className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Aplicar
          </button>
          <a
            href="/reports/usage"
            className="ml-auto self-center text-xs text-primary underline-offset-2 hover:underline print:hidden"
          >
            Reporte de tiempo de uso →
          </a>
        </form>

        {error ? (
          <Callout tone="critical" title="No se pudieron cargar los incidentes">
            {error.message}
          </Callout>
        ) : (
          <ReportView
            orgName={session?.organization?.name ?? 'Organizacion'}
            from={from}
            to={to}
            generatedAt={now.toISOString()}
            incidents={incidents}
          />
        )}
      </div>
    </>
  )
}
