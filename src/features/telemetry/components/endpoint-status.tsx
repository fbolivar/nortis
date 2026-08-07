import { Badge } from '@/shared/components/ui'
import type { Endpoint, EndpointStatus } from '@/shared/types/database'

/** Un equipo sin señal en 15 minutos se considera fuera de linea. */
export const OFFLINE_THRESHOLD_MIN = 15

export type LiveStatus = 'online' | 'stale' | 'offline' | 'quarantined'

/**
 * Estado real del equipo, combinando la columna `status` con `last_seen_at`.
 *
 * La columna sola no basta: un agente que muere sin avisar deja `status` en
 * 'online' para siempre, y el panel mostraria cobertura que no existe. En un
 * producto de monitoreo, un equipo que dejo de reportar es precisamente el que
 * hay que mirar — puede ser una averia, o alguien que desinstalo el agente.
 *
 * 'quarantined' es una decision humana y gana sobre cualquier heuristica.
 */
export function resolveLiveStatus(
  endpoint: Pick<Endpoint, 'status' | 'last_seen_at'>,
  nowMs: number
): LiveStatus {
  if (endpoint.status === 'quarantined') return 'quarantined'
  if (!endpoint.last_seen_at) return 'offline'

  const minutesSinceSeen = (nowMs - new Date(endpoint.last_seen_at).getTime()) / 60_000

  if (minutesSinceSeen <= OFFLINE_THRESHOLD_MIN) return 'online'
  // Zona intermedia: reporto hoy pero no hace un momento. Distinguirla evita
  // que un equipo apagado al almuerzo se vea igual que uno desaparecido.
  if (minutesSinceSeen <= 60 * 24) return 'stale'
  return 'offline'
}

const STATUS_META: Record<LiveStatus, { label: string; tone: 'success' | 'warning' | 'critical' | 'neutral' }> = {
  online: { label: 'En linea', tone: 'success' },
  stale: { label: 'Sin señal reciente', tone: 'warning' },
  offline: { label: 'Fuera de linea', tone: 'neutral' },
  quarantined: { label: 'En cuarentena', tone: 'critical' },
}

export function EndpointStatusBadge({ status }: { status: LiveStatus }) {
  const meta = STATUS_META[status]
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export const ENDPOINT_STATUS_LABEL: Record<EndpointStatus, string> = {
  online: 'En linea',
  offline: 'Fuera de linea',
  quarantined: 'En cuarentena',
}
