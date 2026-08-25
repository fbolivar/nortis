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
 * bajando la opacidad del texto: sobre el azul de marca, un blanco al 70% cae
 * por debajo del contraste minimo para texto pequeño.
 *
 * El velo interior es `white/10` y no `white/15`: sobre el azul intermedio, un
 * 15% sube la superficie hasta dejar el texto blanco en 4.2:1 — por debajo del
 * minimo. Con 10% se queda en 4.7:1.
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
    <div className={cn('rounded-xl bg-white/15 px-3 py-2', wide && 'col-span-2')}>
      <p className="text-[0.625rem] uppercase tracking-[0.08em] text-primary-foreground/80">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-primary-foreground">{value}</p>
    </div>
  )
}

/**
 * Panel maestro-detalle de incidentes.
 *
 * Tarjeta blanca como el resto del panel: a la izquierda la cola, a la derecha el
 * incidente seleccionado. La fila activa y la tarjeta de detalle se pintan con el
 * azul de marca (`primary`) sobre blanco —donde tiene contraste de sobra— y el
 * texto encima va en blanco (`primary-foreground`).
 *
 * Los colores de severidad son las mismas pastillas claras que en las tablas: la
 * severidad tiene que verse exactamente igual aqui que en la cola, o deja de ser
 * comparable.
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
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-surface p-4 shadow-card sm:p-5',
        'motion-safe:animate-rise'
      )}
    >
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            {/* Punto latiente: la cola se alimenta de telemetria que entra sola,
                y sin esta señal el bloque se lee como una captura estatica. Es
                decorativo — el dato duro es la marca de tiempo de cada fila. */}
            <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary motion-safe:animate-pulse-dot" />
            </span>
            Incidentes recientes
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ultimas violaciones de politica detectadas en los equipos
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar incidentes"
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-0.5"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                tab === id
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
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
        <div className="relative z-10 mt-3 flex flex-col items-center justify-center rounded-xl bg-surface-muted px-6 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">
            {incidents.length === 0 ? emptyTitle : 'Nada coincide con esta pestaña'}
          </p>
          <p className="mt-1.5 max-w-md text-xs text-muted-foreground">
            {incidents.length === 0
              ? emptyDescription
              : 'Cambie a "Todos" para ver el resto de la cola.'}
          </p>
          {incidents.length === 0 && emptyAction ? (
            <div className="mt-4">{emptyAction}</div>
          ) : null}
        </div>
      ) : (
        // En movil se apila: primero la lista, el detalle debajo. Partir la
        // pantalla en dos columnas de 160px dejaria ambas ilegibles.
        <div className="relative z-10 mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
          {/* `min-w-0`: un item de rejilla arranca en `min-width:auto`, asi que la
              lista se estira hasta el nombre de regla mas largo y saca scroll
              horizontal al documento entero en telefono. */}
          {/*
            La cola scrollea dentro de si misma. Con doce filas visibles el
            bloque medía mas de 800px y empujaba las graficas fuera de pantalla:
            el panel dejaba de ser un resumen de un vistazo. `max-h` en rem y no
            un numero de filas para que el corte caiga siempre a media fila —una
            fila cortada es lo que hace evidente que hay mas abajo.
          */}
          <ul
            className="scroll-ink flex max-h-[19.5rem] min-w-0 flex-col gap-1 overflow-y-auto pr-1.5"
            aria-label="Cola de incidentes"
          >
            {filtered.map((incident) => {
              const active = selected?.id === incident.id
              return (
                <li key={incident.id}>
                  <button
                    onClick={() => setSelectedId(incident.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl py-2 pl-3 pr-2.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      active
                        ? 'bg-primary'
                        : 'border border-border/60 bg-surface-muted hover:bg-muted'
                    )}
                  >
                    {/* Marca de seleccion. Al reducir el alto de fila, el solo
                        cambio de fondo ya no bastaba para localizar la fila activa
                        de un vistazo en una cola de doce. */}
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-white/70"
                      />
                    ) : null}

                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        active
                          ? 'bg-white/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                      aria-hidden
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-xs font-medium',
                          active ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {ruleLabel(incident.rule_triggered)}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 flex items-center gap-1.5 text-[0.6875rem]',
                          active ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        )}
                      >
                        <span className="font-mono">{shortId(incident.id)}</span>
                        <span aria-hidden>·</span>
                        <span>{formatRelative(incident.detected_at)}</span>
                      </span>
                    </span>

                    <Badge
                      tone={SEVERITY_TONE[incident.severity]}
                      className="shrink-0 px-2 py-0.5 text-[0.625rem]"
                    >
                      {SEVERITY_LABEL[incident.severity]}
                    </Badge>
                  </button>
                </li>
              )
            })}
          </ul>

          {selected ? (
            // `self-start`: sin el, la rejilla estira el detalle hasta el alto
            // de la cola y deja un bloque azul vacio bajo el boton.
            <article className="relative flex min-w-0 flex-col self-start overflow-hidden rounded-xl bg-primary p-4">
              {/* Barrido de luz al cambiar de incidente. `key` fuerza el remontaje
                  para que la animacion se dispare en cada seleccion y el panel
                  acuse el cambio: sin el, cambiar de fila solo permuta texto y
                  cuesta ver que algo respondio. */}
              <span
                key={selected.id}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent motion-safe:animate-sheen"
                style={{ animationIterationCount: 1 }}
              />

              <p className="relative flex items-center gap-2 font-mono text-[0.6875rem] text-primary-foreground/80">
                {/* Marca clara: detalle grafico decorativo, aria-hidden. */}
                <span className="h-3 w-0.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                {shortId(selected.id)}
              </p>
              <h3 className="relative mt-1.5 text-base font-semibold leading-tight tracking-tight text-primary-foreground">
                {ruleLabel(selected.rule_triggered)}
              </h3>
              <p className="relative mt-1 text-xs text-primary-foreground/85">
                {CHANNEL_LABEL[selected.rule_channel ?? ''] ?? selected.rule_channel ?? 'Sin canal'}
                {' · '}
                {selected.endpoints?.hostname ?? 'Equipo desconocido'}
              </p>

              <div className="relative mt-3 grid grid-cols-2 gap-1.5">
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
                className="relative mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-surface px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              >
                Abrir incidente
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </article>
          ) : null}
        </div>
      )}
    </section>
  )
}
