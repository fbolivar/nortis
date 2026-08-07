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

/** Cuadro del icono. Fondo `subtle` + simbolo solido: el mismo par que los Badge. */
const ICON_TONES: Record<Tone, string> = {
  neutral: 'bg-primary-subtle text-primary',
  critical: 'bg-critical-subtle text-critical',
  warning: 'bg-warning-subtle text-warning',
  success: 'bg-success-subtle text-success',
}

/**
 * Filete superior de la tarjeta.
 *
 * Sustituye al peso que antes aportaba el tamaño: con la cifra reducida, es
 * este trazo el que identifica el estado de un vistazo a lo largo de la fila.
 * Arranca al 40% de opacidad y se satura al pasar el cursor, asi que en reposo
 * es un matiz y no cuatro lineas de color compitiendo entre si.
 */
const RAIL_TONES: Record<Tone, string> = {
  neutral: 'bg-primary',
  critical: 'bg-critical',
  warning: 'bg-warning',
  success: 'bg-success',
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
 * DENSIDAD: la cifra ocupa 28px, no 44px. Cuatro numeros a 44px empujan el resto
 * del tablero por debajo del pliegue, y la jerarquia de un resumen no la da el
 * tamaño absoluto sino el CONTRASTE con lo que tiene al lado: a 28px sobre una
 * etiqueta de 11px la cifra sigue dominando, y caben las graficas en la misma
 * pantalla. La etiqueta va en versalitas y con `tracking` abierto — a ese cuerpo
 * es lo que la mantiene legible como rotulo en vez de como texto corrido.
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
  delay = 0,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: Tone
  icon?: LucideIcon
  delta?: StatDelta
  visual?: StatVisual
  /** Retardo de entrada en ms. Escalona la fila sin que la pagina orqueste nada. */
  delay?: number
}) {
  const DeltaIcon =
    delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus
  const series = visual?.data?.length ? visual.data : null

  return (
    <div
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border/70 bg-surface p-4 shadow-card',
        // El realce al pasar el cursor es de 2px. Suficiente para que la tarjeta
        // responda; no tanto como para que la fila entera parezca inestable.
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lifted',
        'motion-reduce:transform-none motion-reduce:transition-none',
        'motion-safe:animate-rise'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-px opacity-40 transition-opacity duration-200 group-hover:opacity-100',
          RAIL_TONES[tone]
        )}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {Icon ? null : (
            <span
              className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', DOT_TONES[tone])}
              aria-hidden
            />
          )}
          {/*
            La etiqueta ENVUELVE, no se trunca. En telefono las tarjetas van a
            dos columnas y "Equipos con agente" no cabe en una linea: truncada
            queda en "Equipos con...", que es justo la parte que no identifica
            la metrica. Dos lineas de 11px cuestan 14px; una etiqueta ambigua
            cuesta la tarjeta entera.
          */}
          <p className="text-[0.6875rem] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
        </div>
        {Icon ? (
          // Cuadro redondeado y no circulo: a 28px un circulo deja el simbolo
          // con menos area util y la fila de tarjetas pierde alineacion optica
          // contra los bordes rectos del resto del tablero.
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              ICON_TONES[tone]
            )}
            aria-hidden
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>

      {/*
        Cifra y variacion comparten linea base. Apiladas gastaban una fila entera
        para dos datos que se leen juntos, y era buena parte del alto sobrante.
      */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className={cn('text-2xl font-semibold tabular-nums tracking-tight', VALUE_TONES[tone])}>
          {value}
        </p>
        {delta ? (
          <p
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium tabular-nums',
              DELTA_INTENTS[delta.intent ?? 'neutral']
            )}
          >
            <DeltaIcon className="h-3 w-3 shrink-0" aria-hidden />
            {delta.value}
          </p>
        ) : null}
      </div>

      {/*
        La pista pegada a la cifra; SOLO la mini-grafica se ancla abajo.
        Las tarjetas de una fila comparten alto —lo impone la rejilla— y la que
        lleva grafica es ~30px mas alta que las demas. Si se ancla abajo el
        bloque entero, en las tarjetas sin grafica ese sobrante se abre como un
        hueco ENTRE la cifra y su pista, que se lee como contenido a medio
        cargar. Anclando solo la grafica, el sobrante queda al pie de la tarjeta
        y se lee como margen.
      */}
      {hint ? (
        <p className="mt-1.5 text-[0.6875rem] leading-snug text-muted-foreground">{hint}</p>
      ) : null}

      <div className="mt-auto">
        {series ? (
          <div className={cn('pt-2.5', VISUAL_TONES[tone])}>
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
              className="h-6 w-full"
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
