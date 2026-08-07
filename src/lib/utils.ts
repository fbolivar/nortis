import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Fecha corta y absoluta. En forense nunca se usa "hace 3 horas" como dato duro. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Marca de tiempo a partir de la cual un endpoint se considera fuera de linea.
 *
 * Vive fuera del componente a proposito: leer el reloj es una operacion impura y
 * hacerlo en el cuerpo de un Server Component dispara la regla de pureza de
 * React. Aqui la dependencia del momento actual es intencional —"en linea"
 * significa "reporto hace poco"— y la pagina se renderiza por peticion.
 */
export function offlineCutoffISO(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

/**
 * Momento actual en milisegundos, para clasificar equipos por su ultima señal.
 *
 * Se lee UNA vez por render y se pasa hacia abajo: si cada fila consultara el
 * reloj por su cuenta, dos equipos con el mismo last_seen_at podrian caer en
 * categorias distintas segun el milisegundo en que se evaluo cada una.
 *
 * Vive fuera de los componentes por el mismo motivo que offlineCutoffISO: leer
 * el reloj es impuro y en el cuerpo de un Server Component dispara la regla de
 * pureza de React. Aqui la dependencia del momento actual es el proposito.
 */
export function nowMs(): number {
  return Date.now()
}

/** Antiguedad legible, para columnas de "ultima conexion". */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return 'nunca'
  const diffMs = Date.now() - new Date(value).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} d`
}
