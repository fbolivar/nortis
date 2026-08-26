import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'

export type TaskRow = {
  id: string
  endpoint_id: string
  kind: 'install_msi' | 'push_file' | 'restart'
  status: 'pending' | 'sent' | 'running' | 'done' | 'failed'
  exit_code: number | null
  output: string | null
  error: string | null
  created_at: string
  completed_at: string | null
  endpoints: { hostname: string } | null
}

const KIND_LABEL: Record<TaskRow['kind'], string> = {
  install_msi: 'Instalar MSI',
  push_file: 'Colocar archivo',
  restart: 'Reiniciar',
}

const STATUS: Record<
  TaskRow['status'],
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'critical' }
> = {
  pending: { label: 'Encargada', tone: 'warning' },
  sent: { label: 'Enviada al equipo', tone: 'warning' },
  running: { label: 'Ejecutando', tone: 'warning' },
  done: { label: 'Aplicada', tone: 'success' },
  failed: { label: 'Fallo', tone: 'critical' },
}

export function TaskList({ rows }: { rows: TaskRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tareas recientes</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Estado de las ultimas tareas encargadas. El agente las aplica en el proximo minuto y
          reporta el resultado.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState
            title="Aun no se ha encargado ninguna tarea"
            description="Use el panel de arriba para instalar un MSI, colocar un archivo o reiniciar equipos."
          />
        ) : (
          rows.map((t) => {
            const s = STATUS[t.status]
            return (
              <div key={t.id} className="rounded-xl border border-border/60 bg-surface-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {KIND_LABEL[t.kind]}
                      <span className="text-muted-foreground"> · {t.endpoints?.hostname ?? 'equipo'}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(t.created_at)}
                      {t.exit_code != null ? ` · codigo ${t.exit_code}` : ''}
                    </p>
                  </div>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>

                {t.error ? (
                  <p className="forensic mt-2 break-all text-xs text-critical">{t.error}</p>
                ) : null}

                {t.output ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                      Ver salida
                    </summary>
                    <pre className="mt-1.5 max-h-48 overflow-auto rounded-md border border-border bg-surface p-2 text-xs">
                      {t.output}
                    </pre>
                  </details>
                ) : null}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
