import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/shared/components/ui'

/**
 * "Usuarios por incidentes": quien acumula mas violaciones de politica. Es la
 * vista centrada en la persona del analisis de comportamiento — el resto del
 * panel mira equipos y datos; esto mira usuarios.
 */
export function UsersByIncidents({ rows }: { rows: { user: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuarios por incidentes</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">Ultimos 30 dias</p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-2">
            <EmptyState
              title="Sin incidentes atribuidos"
              description="Cuando un incidente registre el usuario del equipo, aparecera aqui."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.user} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="min-w-0 truncate text-sm text-foreground">{r.user}</span>
                <span className="shrink-0 rounded-full bg-critical-subtle px-2 py-0.5 text-xs font-semibold tabular-nums text-critical">
                  {r.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
