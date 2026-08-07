'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ShieldAlert } from 'lucide-react'
import { cn, formatDateTime, formatRelative } from '@/lib/utils'
import { Badge } from '@/shared/components/ui'
import {
  CHANNEL_LABEL,
  ENFORCEMENT_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  SEVERITY_TONE,
  STATUS_LABEL,
  ruleLabel,
} from '../types/incidents'
import type { IncidentSeverity, IncidentStatus } from '@/shared/types/database'

export interface SpotlightIncident {
  id: string
  rule_triggered: string
  rule_channel: string | null
  severity: IncidentSeverity
  status: IncidentStatus
  detected_at: string
  enforcement_action: string | null
  endpoints: { hostname: string } | null
}

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Abiertos' },
  { id: 'critical', label: 'Criticos' },
] as const

type TabId = (typeof TABS)[number]['id']

/** Identificador corto. El UUID completo no cabe y nadie lo lee entero de un vistazo. */
function shortId(id: string) {
  return `#${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

/**
 * Dato del detalle. Etiqueta y valor se distinguen por tamaño y peso, nunca
 * bajando la opacidad del texto: sobre el violeta de marca, un blanco al 70% cae
 * por debajo del contraste minimo para texto pequeño.
 */
function DetailCell({
  label,
  value,
  wide,
}: {
  label: string
  value: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn('rounded-2xl bg-white/15 px-3.5 py-3', wide && 'col-span-2')}>
      <p className="text-xs font-normal text-primary-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-primary-foreground">{value}</p>
    </div>
  )
}

/**
 * Panel maestro-detalle de incidentes.
 *
 * Bloque oscuro a proposito: es el unico elemento de la consola que invierte la
 * superficie, y esa inversion es lo que lo separa del resto del panel sin
 * necesidad de un titulo enorme. A la izquierda la cola, a la derecha el
 * incidente seleccionado.
 *
 * Los colores de severidad siguen siendo pastillas claras —las mismas que en las
 * tablas— y no tonos adaptados al fondo oscuro: la severidad tiene que verse
 * exactamente igual aqui que en la cola, o deja de ser comparable.
 */
export function IncidentSpotlight({
  incidents,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  incidents: SpotlightIncident[]
  emptyTitle: string
  emptyDescription: string
  emptyAction?: React.ReactNode
}) {
  const [tab, setTab] = useState<TabId>('all')
  const [selectedId, setSelectedId] = useState<string>()

  const filtered = useMemo(() => {
    return incidents
      .filter((incident) => {
        if (tab === 'open') return incident.status === 'open'
        if (tab === 'critical') return incident.severity === 'critical' || incident.severity === 'high'
        return true
      })
      .sort((a, b) => {
        // Severidad primero, luego lo mas reciente: un critico de ayer pesa mas
        // que uno bajo de hace diez minutos.
        const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        if (bySeverity !== 0) return bySeverity
        return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
      })
  }, [incidents, tab])

  // La seleccion se resuelve en render y no en un efecto: al cambiar de pestaña
  // el incidente elegido puede desaparecer de la lista, y con un efecto el
  // detalle mostraria durante un fotograma algo que ya no esta a la vista.
  const selected = filtered.find((incident) => incident.id === selectedId) ?? filtered[0]

  return (
    <section className="rounded-[1.5rem] bg-ink p-4 sm:p-6 lg:rounded-[2rem]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-ink-foreground">
            Incidentes recientes
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Ultimas violaciones de politica detectadas en los equipos
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar incidentes"
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                tab === id
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-ink-muted hover:text-ink-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        // Estado vacio propio y no `EmptyState`: aquel esta calibrado para
        // superficie clara y aqui el texto quedaria por debajo del contraste
        // minimo sobre el bloque oscuro.
        <div className="mt-4 flex flex-col items-center justify-center rounded-[1.25rem] bg-white/5 px-6 py-12 text-center">
          <p className="text-base font-semibold text-ink-foreground">
            {incidents.length === 0 ? emptyTitle : 'Nada coincide con esta pestaña'}
          </p>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            {incidents.length === 0
              ? emptyDescription
              : 'Cambie a "Todos" para ver el resto de la cola.'}
          </p>
          {incidents.length === 0 && emptyAction ? (
            <div className="mt-5">{emptyAction}</div>
          ) : null}
        </div>
      ) : (
        // En movil se apila: primero la lista, el detalle debajo. Partir la
        // pantalla en dos columnas de 160px dejaria ambas ilegibles.
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* `min-w-0`: un item de rejilla arranca en `min-width:auto`, asi que la
              lista se estira hasta el nombre de regla mas largo y saca scroll
              horizontal al documento entero en telefono. */}
          <ul className="flex min-w-0 flex-col gap-1.5" aria-label="Cola de incidentes">
            {filtered.map((incident) => {
              const active = selected?.id === incident.id
              return (
                <li key={incident.id}>
                  <button
                    onClick={() => setSelectedId(incident.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                      active ? 'bg-primary' : 'bg-white/5 hover:bg-white/10'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                        active ? 'bg-white/20 text-primary-foreground' : 'bg-white/10 text-ink-foreground'
                      )}
                      aria-hidden
                    >
                      <ShieldAlert className="h-[1.125rem] w-[1.125rem]" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-sm font-medium',
                          active ? 'text-primary-foreground' : 'text-ink-foreground'
                        )}
                      >
                        {ruleLabel(incident.rule_triggered)}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 flex items-center gap-2 text-xs',
                          active ? 'text-primary-foreground' : 'text-ink-muted'
                        )}
                      >
                        <span className="font-mono">{shortId(incident.id)}</span>
                        <span aria-hidden>·</span>
                        <span>{formatRelative(incident.detected_at)}</span>
                      </span>
                    </span>

                    <Badge tone={SEVERITY_TONE[incident.severity]} className="shrink-0">
                      {SEVERITY_LABEL[incident.severity]}
                    </Badge>
                  </button>
                </li>
              )
            })}
          </ul>

          {selected ? (
            <article className="flex min-w-0 flex-col rounded-[1.25rem] bg-primary p-5">
              <p className="font-mono text-xs text-primary-foreground">{shortId(selected.id)}</p>
              <h3 className="mt-2 text-xl font-semibold leading-tight tracking-tight text-primary-foreground">
                {ruleLabel(selected.rule_triggered)}
              </h3>
              <p className="mt-1.5 text-sm text-primary-foreground">
                {CHANNEL_LABEL[selected.rule_channel ?? ''] ?? selected.rule_channel ?? 'Sin canal'}
                {' · '}
                {selected.endpoints?.hostname ?? 'Equipo desconocido'}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <DetailCell label="Severidad" value={SEVERITY_LABEL[selected.severity]} />
                <DetailCell label="Estado" value={STATUS_LABEL[selected.status]} />
                {/* A ancho completo: la marca de tiempo forense lleva fecha, hora
                    y año, y en media columna se corta justo por el minuto. */}
                <DetailCell wide label="Detectado" value={formatDateTime(selected.detected_at)} />
                <DetailCell
                  wide
                  label="Accion aplicada"
                  value={
                    selected.enforcement_action
                      ? (ENFORCEMENT_LABEL[selected.enforcement_action] ?? selected.enforcement_action)
                      : 'Ninguna'
                  }
                />
              </div>

              <Link
                href={`/incidents/${selected.id}`}
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              >
                Abrir incidente
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>
          ) : null}
        </div>
      )}
    </section>
  )
}
