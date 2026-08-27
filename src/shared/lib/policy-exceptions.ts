import type { Json } from '@/shared/types/database'

export interface ActiveException {
  kind: 'usb' | 'app' | 'web'
  value: string
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : []
}

/**
 * Fusiona las excepciones aprobadas y vigentes en la config que recibe el agente:
 * - usb  → añade el serial a usb.serial_allowlist (queda autorizado).
 * - app  → añade el ejecutable a apps.allowlist y lo quita de apps.blocklist.
 * - web  → quita el dominio de web.blocked_domains.
 * No inventa secciones que no existan; devuelve una copia sin mutar el original.
 */
export function mergePolicyExceptions(config: Json, exceptions: ActiveException[]): Json {
  if (!config || typeof config !== 'object' || Array.isArray(config) || exceptions.length === 0) {
    return config
  }
  const c = { ...(config as Record<string, unknown>) }

  const usb = exceptions.filter((e) => e.kind === 'usb').map((e) => e.value)
  const apps = exceptions.filter((e) => e.kind === 'app').map((e) => e.value.toLowerCase())
  const web = new Set(exceptions.filter((e) => e.kind === 'web').map((e) => e.value.toLowerCase()))

  if (usb.length && c.usb && typeof c.usb === 'object') {
    const u = c.usb as Record<string, unknown>
    c.usb = { ...u, serial_allowlist: [...new Set([...arr(u.serial_allowlist), ...usb])] }
  }
  if (apps.length && c.apps && typeof c.apps === 'object') {
    const a = c.apps as Record<string, unknown>
    c.apps = {
      ...a,
      allowlist: [...new Set([...arr(a.allowlist), ...apps])],
      blocklist: arr(a.blocklist).filter((x) => !apps.includes(x.toLowerCase())),
    }
  }
  if (web.size && c.web && typeof c.web === 'object') {
    const w = c.web as Record<string, unknown>
    c.web = { ...w, blocked_domains: arr(w.blocked_domains).filter((d) => !web.has(d.toLowerCase())) }
  }

  return c as unknown as Json
}
