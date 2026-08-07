'use client'

import { useRouter } from 'next/navigation'
import { EVENT_TYPE_LABEL, type TelemetryEventType } from '@/shared/schemas/telemetry'

/**
 * Filtro por tipo de evento.
 *
 * El estado vive en la URL (?tipo=...) y no en React: asi el analista puede
 * compartir el enlace de una vista filtrada dentro de una investigacion, y el
 * boton de atras del navegador se comporta como espera. En forense, poder
 * referenciar exactamente lo que se estaba mirando importa.
 */
export function EventTypeFilter({
  basePath,
  selected,
}: {
  basePath: string
  selected?: TelemetryEventType
}) {
  const router = useRouter()

  return (
    <select
      value={selected ?? ''}
      onChange={(e) => {
        const value = e.target.value
        router.push(value ? `${basePath}?tipo=${value}` : basePath)
      }}
      className="h-10 rounded-full border border-border bg-surface px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
      aria-label="Filtrar por tipo de evento"
    >
      <option value="">Todos los eventos</option>
      {Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}
