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
import { cn } from '@/lib/utils'
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

/**
 * Alto del lienzo de las graficas cartesianas.
 *
 * Constante compartida y no un numero suelto en cada grafica: la de dias y la de
 * horas viven una al lado de la otra en el panel, y basta con que difieran en
 * unos pocos pixeles para que sus lineas base dejen de coincidir y la fila se
 * lea desalineada.
 */
const CHART_HEIGHT = 168

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
  delay = 0,
}: {
  title: string
  description?: string
  rows: (string | number)[][]
  columns: string[]
  children: React.ReactNode
  isEmpty: boolean
  emptyTitle: string
  emptyDescription: string
  /** Retardo de entrada en ms, para escalonar la rejilla de graficas. */
  delay?: number
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    <Card
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={cn(
        'rounded-xl border-border/70 transition-all duration-200 hover:border-border hover:shadow-lifted',
        'motion-reduce:transition-none motion-safe:animate-rise'
      )}
    >
      <CardHeader className="px-4 pt-4 sm:px-4 sm:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* El titulo baja de 18px a 14px: en una rejilla de cinco tarjetas,
                cinco titulos a 18px pesan mas que las propias graficas. */}
            <CardTitle className="truncate text-sm">{title}</CardTitle>
            {description ? (
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {!isEmpty ? (
            // Pastilla y no enlace subrayado: a este cuerpo el subrayado se
            // confundia con el texto de la descripcion que tiene justo al lado.
            <button
              onClick={() => setShowTable((v) => !v)}
              className="shrink-0 rounded-full border border-border/70 px-2.5 py-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={showTable}
            >
              {showTable ? 'Ver grafica' : 'Ver datos'}
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-3 sm:px-4 sm:py-3 sm:pb-4">
        {isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : showTable ? (
          // Alto fijado al del lienzo: sin esto la tarjeta da un salto al
          // cambiar de grafica a tabla y arrastra a toda la rejilla con ella.
          <div className="overflow-y-auto" style={{ maxHeight: CHART_HEIGHT }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="border-b border-border px-2 py-1.5 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground"
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
  delay,
}: {
  data: { day: string; event_count: number }[]
  delay?: number
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
      delay={delay}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={shaped} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
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
            minTickGap={16}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            /* 44px y no menos: por debajo de eso un conteo de tres cifras se
               recorta y "150" se dibuja como "0", que no es una etiqueta
               apretada sino un numero equivocado. */
            width={44}
            allowDecimals={false}
            /* Cuatro marcas y no las que decida Recharts: con el lienzo mas bajo,
               la escala automatica llegaba a apilar seis etiquetas de 11px. */
            tickCount={4}
          />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: 'hsl(var(--chart-grid))' }} />
          <Area
            type="monotone"
            dataKey="event_count"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#fadeActivity)"
            /* Punto solo en el ultimo dato: marca el valor vivo sin sembrar la
               linea de circulos que compiten con la propia serie. */
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
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
  delay,
}: {
  data: { hour: number; event_count: number }[]
  delay?: number
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
      delay={delay}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={shaped} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
            /* Una de cada cuatro horas: con el lienzo mas estrecho, una de cada
               tres etiquetas ya se tocaban entre si en pantallas de 13". */
            interval={3}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            /* 44px y no menos: por debajo de eso un conteo de tres cifras se
               recorta y "150" se dibuja como "0", que no es una etiqueta
               apretada sino un numero equivocado. */
            width={44}
            allowDecimals={false}
            tickCount={4}
          />
          <Tooltip
            content={<TooltipBox />}
            cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
          />
          {/* Radio 3 en el extremo del dato, anclado a la linea base. */}
          <Bar dataKey="event_count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={12} />
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
  delay,
}: {
  title: string
  description?: string
  data: Record<string, string | number>[]
  nameKey: string
  unit: string
  emptyTitle: string
  emptyDescription: string
  delay?: number
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
      delay={delay}
    >
      {/*
        Barras en HTML y no en Recharts: con etiquetas directas en cada fila el
        valor siempre es legible sin pasar el cursor, y el ancho del nombre no
        obliga a reservar un margen izquierdo fijo que descuadra la tarjeta.

        Nombre y valor van SOBRE la barra, no encima de ella: apilados gastaban
        dos filas por categoria y ocho categorias hacian la tarjeta mas alta que
        las graficas de al lado. La barra pasa a ser el fondo de su propia
        etiqueta, que es lo que permite bajar de 8 filas a la mitad de alto.
      */}
      <ul className="space-y-1">
        {data.map((row, i) => {
          const value = Number(row.event_count)
          const name = String(row[nameKey])
          return (
            <li
              key={name}
              className="relative overflow-hidden rounded-md motion-safe:animate-rise"
              style={{ animationDelay: `${(delay ?? 0) + i * 40}ms` }}
            >
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-md bg-primary-subtle transition-[width] duration-500"
                style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
              />
              <div className="relative flex items-baseline justify-between gap-3 px-2 py-1.5 text-[0.6875rem]">
                <span className="truncate font-mono text-foreground" title={name}>
                  {name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {value.toLocaleString('es-CO')} {unit}
                </span>
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
  delay,
}: {
  data: { category: string; event_count: number }[]
  delay?: number
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
      delay={delay}
    >
      <div className="flex flex-wrap items-center gap-4">
        {/*
          El hueco del donut deja de estar vacio: lleva el total. Es el dato que
          antes obligaba a sumar la leyenda a ojo, y ocupa espacio que ya estaba
          reservado — bajar el diametro sin darle uso solo habria dejado un
          agujero mas pequeño.
        */}
        <div className="relative shrink-0">
          <ResponsiveContainer width={116} height={116}>
            <PieChart>
              <Pie
                data={shaped}
                dataKey="event_count"
                nameKey="category"
                innerRadius={34}
                outerRadius={55}
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
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            aria-hidden
          >
            <span className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
              {total.toLocaleString('es-CO')}
            </span>
            <span className="text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
              eventos
            </span>
          </div>
        </div>

        <ul className="min-w-36 flex-1 space-y-1">
          {shaped.map((entry, index) => (
            <li key={entry.category} className="flex items-center gap-2 text-[0.6875rem]">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
              />
              <span className="flex-1 truncate text-foreground">{entry.category}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.round((entry.event_count / total) * 100)}%
              </span>
              <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
                {entry.event_count.toLocaleString('es-CO')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  )
}
