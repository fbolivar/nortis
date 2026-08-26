'use client'

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/shared/components/ui'

/**
 * Paleta de las porciones. Reutiliza los tonos de grafica del sistema, elegidos
 * para superar 3:1 sobre blanco y separarse entre porciones adyacentes.
 */
const SLICE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

/* ------------------------------------------------- Open insights (donut) --- */

export function OpenInsightsDonut({ data }: { data: { type: string; count: number }[] }) {
  // Se pliega la cola en "Otros" para no pasar de 6 porciones (mas alla, las
  // adyacentes se confunden y un septimo tono seria indistinguible).
  const sorted = [...data].sort((a, b) => b.count - a.count)
  const head = sorted.slice(0, 5)
  const tail = sorted.slice(5)
  const shaped = tail.length
    ? [...head, { type: 'Otros', count: tail.reduce((s, d) => s + d.count, 0) }]
    : head
  const total = shaped.reduce((s, d) => s + d.count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incidentes abiertos por tipo</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState
            title="Sin incidentes abiertos"
            description="Cuando un agente detecte una violacion de politica, aparecera aqui clasificada por tipo."
          />
        ) : (
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative shrink-0">
              <ResponsiveContainer width={132} height={132}>
                <PieChart>
                  <Pie
                    data={shaped}
                    dataKey="count"
                    nameKey="type"
                    innerRadius={40}
                    outerRadius={64}
                    paddingAngle={2}
                    stroke="hsl(var(--surface))"
                    strokeWidth={2}
                  >
                    {shaped.map((_, i) => (
                      <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{total}</span>
                <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  abiertos
                </span>
              </div>
            </div>

            <ul className="min-w-0 flex-1 space-y-1.5">
              {shaped.map((d, i) => (
                <li key={d.type} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">{d.type}</span>
                  <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                    {d.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------- Insights over time (bars) --- */

export function IncidentsOverTimeChart({
  data,
}: {
  data: { label: string; count: number }[]
}) {
  const hasAny = data.some((d) => d.count > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incidentes en el tiempo</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">Ultimos 30 dias</p>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <EmptyState
            title="Sin incidentes en el periodo"
            description="La grafica muestra cuantos incidentes se detectaron cada dia."
          />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid hsl(var(--border))',
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value) => [value as number, 'Incidentes']}
              />
              <Bar dataKey="count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
