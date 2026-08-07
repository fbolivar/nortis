'use client'

import * as React from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Barra de filtros de las paginas de listado.
 *
 * Todo control es una pastilla de 40px: es el mismo objetivo tactil que los
 * botones y encaja con la forma que define el resto del sistema.
 *
 * El contador de la izquierda existe por una razon concreta: una tabla filtrada
 * y una tabla vacia se ven igual. Sin decir cuantos filtros hay puestos, el
 * analista que hereda una vista con tres criterios activos concluye que no hay
 * datos, y esa lectura y la correcta llevan a decisiones opuestas.
 */
export function FilterBar({
  activeCount,
  children,
  className,
}: {
  activeCount: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium',
          activeCount > 0
            ? 'bg-primary-subtle text-primary'
            : 'bg-muted text-muted-foreground'
        )}
        // Cambia solo, sin interaccion: se anuncia para que un lector de pantalla
        // sepa por que la tabla acaba de encoger.
        aria-live="polite"
      >
        Filtros activos ({activeCount})
      </span>
      {children}
    </div>
  )
}

const PILL_FIELD =
  'h-10 rounded-full border border-border bg-surface text-sm transition-colors ' +
  'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15'

export interface FilterOption {
  value: string
  label: string
}

/** Select en pastilla. La flecha es propia porque `appearance-none` quita la nativa. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: string
  options: readonly FilterOption[]
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(PILL_FIELD, 'w-full appearance-none pl-4 pr-9')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}

/** Buscador en pastilla con icono. */
export function FilterSearch({
  label,
  value,
  placeholder,
  onChange,
  className,
  inputClassName,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  className?: string
  inputClassName?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        // 16px de fuente: por debajo, Safari en iOS hace zoom al enfocar y
        // descuadra la barra entera.
        className={cn(
          PILL_FIELD,
          'w-full pl-10 pr-4 text-base sm:text-sm',
          'placeholder:text-muted-foreground',
          inputClassName
        )}
      />
    </div>
  )
}
