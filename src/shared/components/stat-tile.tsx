import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'critical' | 'warning' | 'success'

const VALUE_TONES: Record<Tone, string> = {
  neutral: 'text-foreground',
  critical: 'text-critical',
  warning: 'text-warning',
  success: 'text-success',
}

const DOT_TONES: Record<Tone, string> = {
  neutral: 'bg-primary',
  critical: 'bg-critical',
  warning: 'bg-warning',
  success: 'bg-success',
}

/** Circulo del icono. Fondo `subtle` + simbolo solido: el mismo par que los Badge. */
const ICON_TONES: Record<Tone, string> = {
  neutral: 'bg-primary-subtle text-primary',
  critical: 'bg-critical-subtle text-critical',
  warning: 'bg-warning-subtle text-warning',
  success: 'bg-success-subtle text-success',
}

/** Trazo del mini-visual. Sigue al tono, que ya expresa el estado de la metrica. */
const VISUAL_TONES: Record<Tone, string> = {
  neutral: 'text-primary',
  critical: 'text-critical',
  warning: 'text-warning',
  success: 'text-success',
}

/**
 * La variacion NO se colorea por su direccion, sino por lo que significa.
 *
 * "Incidentes +12%" y "Equipos en linea +12%" apuntan hacia arriba y son noticias
 * opuestas. Pintar toda subida de verde convertiria el color en decoracion, que
 * es exactamente lo que este sistema evita. Por eso `intent` es explicito y por
 * defecto la variacion es neutra.
 */
const DELTA_INTENTS = {
  good: 'text-success',
  bad: 'text-critical',
  neutral: 'text-muted-foreground',
} as const

export interface StatDelta {
  /** Texto ya formateado: "+12%", "3 mas que ayer". */
  value: string
  direction: 'up' | 'down' | 'flat'
  intent?: keyof typeof DELTA_INTENTS
}

export interface StatVisual {
  /** Serie cronologica, del punto mas antiguo al mas reciente. */
  data: number[]
  kind?: 'line' | 'bars'
  label?: string
}

const VIEW_W = 100
const VIEW_H = 32

/** Normaliza la serie al alto del lienzo. Una serie plana se dibuja centrada. */
function scale(data: number[]): number[] {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min
  if (span === 0) return data.map(() => VIEW_H / 2)
  return data.map((v) => VIEW_H - ((v - min) / span) * (VIEW_H - 2) - 1)
}

function Sparkline({ data }: { data: number[] }) {
  const ys = scale(data)
  const step = data.length > 1 ? VIEW_W / (data.length - 1) : 0
  const points = ys.map((y, i) => `${(i * step).toFixed(2)},${y.toFixed(2)}`)
  const area = `M0,${VIEW_H} L${points.join(' L')} L${VIEW_W},${VIEW_H} Z`

  return (
    <>
      <path d={area} fill="currentColor" opacity="0.12" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        // El viewBox se estira en horizontal para llenar la tarjeta; sin esto el
        // trazo se deforma y engorda con el ancho.
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
}

function Bars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  const slot = VIEW_W / data.length
  const width = Math.max(slot * 0.55, 0.5)

  return (
    <>
      {data.map((v, i) => {
        const height = Math.max((v / max) * VIEW_H, 1)
        return (
          <rect
            key={i}
            x={i * slot + (slot - width) / 2}
            y={VIEW_H - height}
            width={width}
            height={height}
            rx="0.6"
            fill="currentColor"
            // El ultimo tramo es el dato vivo; los anteriores son contexto.
            opacity={i === data.length - 1 ? 0.95 : 0.28}
          />
        )
      })}
    </>
  )
}

/**
 * Metrica del resumen ejecutivo.
 *
 * `tone` NO se pasa fijo desde la pagina: se deriva del valor. Un contador de
 * incidentes abiertos en 0 debe leerse neutro; en 12, critico. Colorear por tipo
 * de metrica en vez de por su estado haria que el tablero se viera igual de rojo
 * un dia tranquilo que uno malo.
 *
 * La cifra domina la tarjeta (44px) porque el panel se consulta de un vistazo:
 * el analista lee cuatro numeros y solo baja al detalle si alguno le llama.
 *
 * `icon`, `delta` y `visual` son opcionales. Sin ellos la tarjeta sigue siendo
 * valida: hay metricas que no tienen historico que dibujar, y una zona de grafica
 * vacia se lee como datos que faltan.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  delta,
  visual,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: Tone
  icon?: LucideIcon
  delta?: StatDelta
  visual?: StatVisual
}) {
  const DeltaIcon =
    delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus
  const series = visual?.data?.length ? visual.data : null

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 pt-1">
          {Icon ? null : (
            <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT_TONES[tone])} aria-hidden />
          )}
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </div>
        {Icon ? (
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              ICON_TONES[tone]
            )}
            aria-hidden
          >
            <Icon className="h-[1.125rem] w-[1.125rem]" />
          </span>
        ) : null}
      </div>

      <p className={cn('mt-3 text-4xl font-semibold tabular-nums tracking-tight', VALUE_TONES[tone])}>
        {value}
      </p>

      {/*
        Pie anclado abajo (`mt-auto`). Las tarjetas de una fila comparten alto
        —lo impone la rejilla— y sin anclaje el contenido se apelotona arriba y
        deja un hueco muerto bajo la cifra que se lee como algo que falta por
        cargar. Anclado, el aire queda ENTRE la cifra y su contexto, que es
        justamente la jerarquia que se quiere.
      */}
      <div className="mt-auto">
        {delta ? (
          <p
            className={cn(
              'mt-3 flex items-center gap-1 text-sm font-medium tabular-nums',
              DELTA_INTENTS[delta.intent ?? 'neutral']
            )}
          >
            <DeltaIcon className="h-4 w-4 shrink-0" aria-hidden />
            {delta.value}
          </p>
        ) : null}

        {hint ? <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p> : null}

        {series ? (
          <div className={cn('mt-4 pt-1', VISUAL_TONES[tone])}>
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
              className="h-9 w-full"
              role={visual?.label ? 'img' : 'presentation'}
              aria-label={visual?.label}
              aria-hidden={visual?.label ? undefined : true}
              focusable="false"
            >
              {visual?.kind === 'bars' ? <Bars data={series} /> : <Sparkline data={series} />}
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  )
}
