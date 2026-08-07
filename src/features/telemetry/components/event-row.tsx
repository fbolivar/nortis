import { Badge } from '@/shared/components/ui'
import { EVENT_TYPE_LABEL, type TelemetryEventType } from '@/shared/schemas/telemetry'
import type { EventType, Json } from '@/shared/types/database'

/** Bytes legibles. En una columna de tamaños, "2.4 MB" se escanea; "2400000" no. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function eventLabel(type: EventType): string {
  return EVENT_TYPE_LABEL[type as TelemetryEventType] ?? type
}

/** Tono por tipo: solo los eventos que mueven informacion se destacan. */
export function eventTone(type: EventType): 'critical' | 'warning' | 'info' | 'neutral' {
  switch (type) {
    case 'usb_connected':
      return 'critical'
    case 'clipboard_copy':
    case 'print_job':
    case 'file_deleted':
      return 'warning'
    case 'file_created':
    case 'file_modified':
      return 'info'
    default:
      return 'neutral'
  }
}

/**
 * Resumen de una linea de evento.
 *
 * Cada tipo tiene un dato que es EL relevante: la ruta en un evento de archivo,
 * el dominio en una visita web, el serial en un USB. Volcar el jsonb crudo
 * obligaria al analista a leer JSON para escanear una linea de tiempo.
 */
export function describeEvent(type: EventType, payload: Json): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '—'
  const p = payload as Record<string, unknown>
  const text = (key: string) => (typeof p[key] === 'string' ? (p[key] as string) : undefined)

  switch (type) {
    case 'file_created':
    case 'file_modified':
    case 'file_deleted':
      return text('path') ?? '—'
    case 'web_visit':
      return text('domain') ?? '—'
    case 'app_open':
    case 'window_focus':
      // El titulo solo llega si el tenant tiene consentimiento firmado.
      return [text('app'), text('title')].filter(Boolean).join(' — ') || '—'
    case 'usb_connected':
      return text('serial') ? `Serial ${text('serial')}` : (text('label') ?? '—')
    case 'clipboard_copy':
      return `${text('source_app') ?? 'desconocida'} → ${text('target_app') ?? 'desconocida'}`
    case 'print_job':
      return text('document') ?? text('printer') ?? '—'
    case 'logon':
    case 'logoff':
    case 'idle_start':
    case 'idle_end':
      return text('user') ?? '—'
    default:
      return '—'
  }
}

export function EventTypeBadge({ type }: { type: EventType }) {
  return <Badge tone={eventTone(type)}>{eventLabel(type)}</Badge>
}
