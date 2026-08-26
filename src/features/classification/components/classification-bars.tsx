'use client'

import Link from 'next/link'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/shared/components/ui'

export type ClassificationBar = { name: string; color: string; count: number }

/**
 * "Operaciones de archivo por clasificacion": cuantas operaciones sobre archivos
 * corresponden a cada clase de dato (codigo fuente, financiero, datos
 * personales…). Es la vista que la clasificacion por patron habilita — el panel
 * deja de contar archivos anonimos y empieza a contar POR QUE clase de dato es.
 */
export function ClassificationBars({ data }: { data: ClassificationBar[] }) {
  const sorted = [...data].sort((a, b) => b.count - a.count)
  const total = sorted.reduce((s, d) => s + d.count, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Datos por clasificacion</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Operaciones de archivo, ultimos 30 dias
            </p>
          </div>
          <Link
            href="/classification"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Reglas
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState
            title="Sin operaciones de archivo clasificadas"
            description="Cuando los agentes reporten operaciones sobre archivos, se clasificaran por sus reglas y apareceran aqui."
          />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 38)}>
            <BarChart
              layout="vertical"
              data={sorted}
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={128}
                tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid hsl(var(--border))',
                  fontSize: 12,
                }}
                formatter={(value) => [value as number, 'Operaciones']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {sorted.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
