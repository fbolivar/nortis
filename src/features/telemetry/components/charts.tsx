'use client'

import { useState } from 'react'
import {
  Area,
  AreaChart,
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

/*
 * Reglas que gobiernan todas las graficas de este archivo:
 *
 * 1. Un solo eje. Nunca dos escalas Y en el mismo plano: la alineacion entre
 *    ambas es arbitraria e inventa una correlacion que no esta en los datos.
 * 2. Categorias nominales (aplicaciones, dominios, equipos) = UN solo color.
 *    Pintarlas mas oscuras cuanto mas grandes duplicaria en el tono la misma
 *    informacion que ya da la longitud de la barra, y gastaria el unico canal
 *    libre que queda.
 * 3. El texto usa tokens de texto, nunca el color de la serie.
 * 4. Toda grafica tiene su gemela en tabla ("Ver datos"): el tooltip mejora la
 *    lectura, nunca es la unica via de acceder a un valor.
 * 5. Rejilla y ejes solidos y discretos. Nada de lineas punteadas: el punteado
 *    se lee como "proyeccion" o "umbral" cuando solo es una rejilla.
 */

const AXIS_STYLE = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } as const

function TooltipBox({
  active,
  payload,
  label,
  unit = 'eventos',
}: {
  active?: boolean
  payload?: { value?: number | string; name?: string }[]
  label?: string | number
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lifted">
      <p className="font-medium text-foreground">{label}</p>
      <p className="tabular-nums text-muted-foreground">
        {Number(payload[0]?.value ?? 0).toLocaleString('es-CO')} {unit}
      </p>
    </div>
  )
}

/** Contenedor con titulo y acceso a los datos en tabla. */
function ChartFrame({
  title,
  description,
  rows,
  columns,
  children,
  isEmpty,
  emptyTitle,
  emptyDescription,
}: {
  title: string
  description?: string
  rows: (string | number)[][]
  columns: string[]
  children: React.ReactNode
  isEmpty: boolean
  emptyTitle: string
  emptyDescription: string
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {!isEmpty ? (
            <button
              onClick={() => setShowTable((v) => !v)}
              className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              aria-expanded={showTable}
            >
              {showTable ? 'Ver grafica' : 'Ver datos'}
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : showTable ? (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="border-b border-border px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className="border-b border-border/60 px-2 py-1.5 tabular-nums"
                      >
                        {typeof cell === 'number' ? cell.toLocaleString('es-CO') : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------- Actividad por dia ------ */

export function ActivityByDayChart({
  data,
}: {
  data: { day: string; event_count: number }[]
}) {
  const shaped = data.map((d) => ({
    ...d,
    label: new Date(`${d.day}T00:00:00`).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
    }),
  }))

  return (
    <ChartFrame
      title="Actividad por dia"
      description="Eventos recibidos en los ultimos 14 dias"
      columns={['Dia', 'Eventos']}
      rows={shaped.map((d) => [d.label, d.event_count])}
      isEmpty={data.length === 0}
      emptyTitle="Sin telemetria en los ultimos 14 dias"
      emptyDescription="Los equipos con agente instalado reportan actividad de forma continua."
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={shaped} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="fadeActivity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: 'hsl(var(--chart-grid))' }} />
          <Area
            type="monotone"
            dataKey="event_count"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#fadeActivity)"
            /* Serie unica: el titulo la nombra, no hace falta leyenda. */
            name="Eventos"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ------------------------------------------------ Actividad por hora ------ */

export function ActivityByHourChart({
  data,
}: {
  data: { hour: number; event_count: number }[]
}) {
  // Se rellenan las 24 horas: si solo se dibujan las que tienen datos, el eje
  // miente sobre la jornada real y "no hubo actividad a las 3am" se vuelve
  // invisible en vez de informativo.
  const shaped = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}h`,
    event_count: data.find((d) => d.hour === hour)?.event_count ?? 0,
  }))

  return (
    <ChartFrame
      title="Actividad por hora del dia"
      description="Distribucion horaria de los ultimos 7 dias"
      columns={['Hora', 'Eventos']}
      rows={shaped.map((d) => [d.label, d.event_count])}
      isEmpty={data.length === 0}
      emptyTitle="Sin datos horarios"
      emptyDescription="Se necesita al menos un dia de telemetria para construir este reporte."
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={shaped} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
            interval={2}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            content={<TooltipBox />}
            cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
          />
          {/* Radio 4 en el extremo del dato, anclado a la linea base. */}
          <Bar dataKey="event_count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ------------------------------------------------------ Ranking barras ---- */

/**
 * Ranking horizontal para categorias nominales.
 *
 * Un solo color para todas las barras: el orden ya esta en la longitud, y una
 * rampa por valor duplicaria esa informacion en el tono.
 */
export function RankingChart({
  title,
  description,
  data,
  nameKey,
  unit,
  emptyTitle,
  emptyDescription,
}: {
  title: string
  description?: string
  data: Record<string, string | number>[]
  nameKey: string
  unit: string
  emptyTitle: string
  emptyDescription: string
}) {
  const max = Math.max(1, ...data.map((d) => Number(d.event_count)))

  return (
    <ChartFrame
      title={title}
      description={description}
      columns={[nameKey === 'app' ? 'Aplicacion' : 'Dominio', 'Eventos']}
      rows={data.map((d) => [String(d[nameKey]), Number(d.event_count)])}
      isEmpty={data.length === 0}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    >
      {/*
        Barras en HTML y no en Recharts: con etiquetas directas en cada fila el
        valor siempre es legible sin pasar el cursor, y el ancho del nombre no
        obliga a reservar un margen izquierdo fijo que descuadra la tarjeta.
      */}
      <ul className="space-y-2">
        {data.map((row) => {
          const value = Number(row.event_count)
          const name = String(row[nameKey])
          return (
            <li key={name}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-mono text-foreground" title={name}>
                  {name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {value.toLocaleString('es-CO')} {unit}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (value / max) * 100)}%`,
                    backgroundColor: 'var(--chart-1)',
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </ChartFrame>
  )
}

/* ------------------------------------------------- Uso por categoria ------ */

const CATEGORY_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

export function CategoryDonutChart({
  data,
}: {
  data: { category: string; event_count: number }[]
}) {
  /*
   * Se pliega la cola en "Otras" para no pasar de 6 porciones.
   *
   * No es un limite estetico: mas alla de ~6 clases con significado, las
   * adyacentes se confunden entre si, y un septimo tono generado seria
   * indistinguible de otro existente bajo daltonismo. La leyenda lleva el valor
   * y el porcentaje de cada porcion, de modo que comparar dos categorias
   * parecidas no dependa de juzgar angulos a ojo.
   */
  const sorted = [...data].sort((a, b) => b.event_count - a.event_count)
  const head = sorted.slice(0, 5)
  const tail = sorted.slice(5)
  const shaped = tail.length
    ? [...head, { category: 'Otras', event_count: tail.reduce((s, d) => s + d.event_count, 0) }]
    : head

  const total = shaped.reduce((s, d) => s + d.event_count, 0) || 1

  return (
    <ChartFrame
      title="Uso por categoria de software"
      description="Aperturas de aplicacion en los ultimos 7 dias"
      columns={['Categoria', 'Eventos']}
      rows={shaped.map((d) => [d.category, d.event_count])}
      isEmpty={data.length === 0}
      emptyTitle="Sin aperturas de aplicacion registradas"
      emptyDescription="La categoria la asigna el agente al detectar el proceso."
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0">
          <ResponsiveContainer width={150} height={150}>
            <PieChart>
              <Pie
                data={shaped}
                dataKey="event_count"
                nameKey="category"
                innerRadius={42}
                outerRadius={70}
                /* 2px de separacion entre porciones: nunca un borde dibujado. */
                paddingAngle={2}
                stroke="hsl(var(--surface))"
                strokeWidth={2}
              >
                {shaped.map((entry, index) => (
                  <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<TooltipBox />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="min-w-40 flex-1 space-y-1.5">
          {shaped.map((entry, index) => (
            <li key={entry.category} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
              />
              <span className="flex-1 truncate text-foreground">{entry.category}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.round((entry.event_count / total) * 100)}%
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                {entry.event_count.toLocaleString('es-CO')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  )
}
