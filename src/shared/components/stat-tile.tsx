import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'critical' | 'warning' | 'success'

const VALUE_TONES: Record<Tone, string> = {
  neutral: 'text-foreground',
  critical: 'text-critical',
  warning: 'text-warning',
  success: 'text-success',
}

/**
 * Metrica del resumen ejecutivo.
 *
 * `tone` NO se pasa fijo desde la pagina: se deriva del valor. Un contador de
 * incidentes abiertos en 0 debe leerse neutro; en 12, critico. Colorear por tipo
 * de metrica en vez de por su estado haria que el tablero se viera igual de rojo
 * un dia tranquilo que uno malo.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: Tone
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', VALUE_TONES[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
