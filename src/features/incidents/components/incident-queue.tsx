'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormError,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { FilterBar, FilterSearch, FilterSelect } from '@/shared/components/filter-bar'
import { formatRelative } from '@/lib/utils'
import {
  CHANNEL_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  ruleLabel,
} from '../types/incidents'
import type { IncidentSeverity, IncidentStatus, Json } from '@/shared/types/database'

export interface QueueIncident {
  id: string
  endpoint_id: string
  rule_triggered: string
  rule_channel: string | null
  severity: IncidentSeverity
  status: IncidentStatus
  enforcement_action: string | null
  detected_at: string
  event_snapshot: Json
  classification: string | null
  endpoints: { hostname: string } | null
}

function occurrences(snapshot: Json): number | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>).occurrences
  return typeof value === 'number' ? value : null
}

export function IncidentQueue({
  incidents,
  canReview,
}: {
  incidents: QueueIncident[]
  canReview: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState<IncidentStatus | 'all'>('open')
  const [severity, setSeverity] = useState<IncidentSeverity | 'all'>('all')
  const [channel, setChannel] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return incidents
      .filter((i) => status === 'all' || i.status === status)
      .filter((i) => severity === 'all' || i.severity === severity)
      .filter((i) => channel === 'all' || i.rule_channel === channel)
      .filter((i) => {
        if (!needle) return true
        // Se busca sobre la etiqueta legible ademas del identificador crudo: el
        // analista recuerda "carpeta no autorizada", no "storage.carpeta_...".
        return (
          ruleLabel(i.rule_triggered).toLowerCase().includes(needle) ||
          i.rule_triggered.toLowerCase().includes(needle) ||
          (i.endpoints?.hostname ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => {
        // Severidad primero, luego lo mas reciente. Un incidente critico de
        // ayer importa mas que uno bajo de hace diez minutos.
        const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        if (bySeverity !== 0) return bySeverity
        return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
      })
  }, [incidents, status, severity, channel, query])

  const channels = useMemo(
    () => [...new Set(incidents.map((i) => i.rule_channel).filter(Boolean))] as string[],
    [incidents]
  )

  async function bulkReview(next: IncidentStatus) {
    if (selected.size === 0) return
    setError(undefined)
    setPending(true)

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

    // reviewed_by y reviewed_at los sella un trigger, pero se envian igual: el
    // CHECK de la tabla exige atribucion en cualquier estado distinto de open, y
    // depender solo del trigger dejaria el INSERT a merced de su orden.
    const { error: updateError } = await supabase
      .from('dlp_incidents')
      .update({
        status: next,
        reviewed_by: userData.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', [...selected])

    setPending(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setSelected(new Set())
    router.refresh()
  }

  /** Selecciona todo lo visible bajo los filtros actuales, no la cola entera. */
  function toggleAll() {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id))
    )
  }

  // El estado arranca en "Abiertos", asi que la cola nace con un filtro puesto.
  // Contarlo es justo el punto: quien llega y ve la tabla corta tiene que poder
  // saber que no la esta viendo entera.
  const activeFilters =
    (status === 'all' ? 0 : 1) +
    (severity === 'all' ? 0 : 1) +
    (channel === 'all' ? 0 : 1) +
    (query.trim() ? 1 : 0)

  const openCount = incidents.filter((i) => i.status === 'open').length
  const criticalOpen = incidents.filter(
    (i) => i.status === 'open' && (i.severity === 'critical' || i.severity === 'high')
  ).length

  return (
    <div className="space-y-5">
      {criticalOpen > 0 ? (
        <Callout tone="critical" title={`${criticalOpen} incidentes graves sin revisar`}>
          Severidad alta o critica pendiente de atencion.
        </Callout>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Cola de incidentes ({filtered.length} de {incidents.length})
          </CardTitle>

          <FilterBar activeCount={activeFilters} className="mt-4">
            <FilterSearch
              label="Buscar por regla o equipo"
              value={query}
              onChange={setQuery}
              placeholder="Regla o equipo…"
              className="min-w-[12rem] flex-1 sm:max-w-xs"
            />
            <FilterSelect
              label="Filtrar por estado"
              value={status}
              onChange={(value) => setStatus(value as IncidentStatus | 'all')}
              options={[
                { value: 'open', label: `Abiertos (${openCount})` },
                { value: 'reviewed', label: 'Revisados' },
                { value: 'closed', label: 'Cerrados' },
                { value: 'false_positive', label: 'Falsos positivos' },
                { value: 'all', label: 'Todos los estados' },
              ]}
            />
            <FilterSelect
              label="Filtrar por severidad"
              value={severity}
              onChange={(value) => setSeverity(value as IncidentSeverity | 'all')}
              options={[
                { value: 'all', label: 'Toda severidad' },
                { value: 'critical', label: 'Critica' },
                { value: 'high', label: 'Alta' },
                { value: 'medium', label: 'Media' },
                { value: 'low', label: 'Baja' },
              ]}
            />
            <FilterSelect
              label="Filtrar por canal"
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'all', label: 'Todos los canales' },
                ...channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] ?? c })),
              ]}
            />
          </FilterBar>

          {/*
            Revision masiva. Es lo que hace operable la cola: la mayoria de
            incidentes de una misma regla se resuelven con el mismo veredicto, y
            obligar a abrirlos de uno en uno garantiza que nadie los revise.
          */}
          {canReview && selected.size > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3">
              <span className="text-xs text-muted-foreground">
                {selected.size} seleccionados:
              </span>
              <Button size="sm" variant="secondary" onClick={() => bulkReview('reviewed')} disabled={pending}>
                Marcar revisados
              </Button>
              <Button size="sm" variant="secondary" onClick={() => bulkReview('closed')} disabled={pending}>
                Cerrar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => bulkReview('false_positive')} disabled={pending}>
                Falso positivo
              </Button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Deseleccionar
              </button>
            </div>
          ) : null}

          <FormError>{error}</FormError>
        </CardHeader>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              title={
                incidents.length === 0
                  ? 'Sin incidentes registrados'
                  : 'Nada coincide con estos filtros'
              }
              description={
                incidents.length === 0
                  ? 'El motor de deteccion evalua la telemetria contra el perfil asignado a cada equipo cada diez minutos. Sin perfiles asignados no se genera ningun incidente.'
                  : 'Pruebe cambiando el estado o quitando el filtro de severidad.'
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  {canReview ? (
                    <Th className="w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        aria-label="Seleccionar todo lo visible"
                      />
                    </Th>
                  ) : null}
                  <Th>Regla</Th>
                  <Th>Equipo</Th>
                  <Th>Severidad</Th>
                  <Th>Ocurrencias</Th>
                  <Th>Estado</Th>
                  <Th>Detectado</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((incident) => {
                  const count = occurrences(incident.event_snapshot)
                  return (
                    <tr key={incident.id} className="hover:bg-surface-muted">
                      {canReview ? (
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(incident.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev)
                                if (next.has(incident.id)) next.delete(incident.id)
                                else next.add(incident.id)
                                return next
                              })
                            }
                            aria-label={`Seleccionar ${incident.rule_triggered}`}
                          />
                        </Td>
                      ) : null}
                      <Td>
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {ruleLabel(incident.rule_triggered)}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {CHANNEL_LABEL[incident.rule_channel ?? ''] ?? incident.rule_channel}
                          {incident.classification ? (
                            <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                              <Tag className="h-3 w-3" aria-hidden />
                              {incident.classification}
                            </span>
                          ) : null}
                        </span>
                      </Td>
                      <Td className="text-muted-foreground">
                        {incident.endpoints?.hostname ?? '—'}
                      </Td>
                      <Td>
                        <Badge tone={SEVERITY_TONE[incident.severity]}>
                          {SEVERITY_LABEL[incident.severity]}
                        </Badge>
                      </Td>
                      <Td className="tabular-nums text-muted-foreground">
                        {count !== null ? count.toLocaleString('es-CO') : '1'}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[incident.status]}>
                          {STATUS_LABEL[incident.status]}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {formatRelative(incident.detected_at)}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Un incidente agrupa todas las ocurrencias de una misma regla en un equipo durante
        un dia. El detalle evento por evento sigue disponible en la linea de tiempo del
        equipo durante los 90 dias de retencion.
      </p>
    </div>
  )
}
