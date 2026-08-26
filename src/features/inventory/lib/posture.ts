import type { Json } from '@/shared/types/database'

/**
 * Interpreta el hardware_info que reporta el agente para sacar la postura de
 * seguridad y la salud del equipo. Todo es tolerante a ausencia: un equipo que
 * aun no reporto un dato lo deja en `undefined` (desconocido), que NO cuenta como
 * incumplimiento.
 */
export interface Posture {
  antivirusEnabled?: boolean
  realtimeEnabled?: boolean
  signatureAgeDays?: number
  firewallOn?: boolean
  pendingReboot?: boolean
  uptimeDays?: number
  diskUsedPct?: number
  diskEncrypted?: boolean
  lastQuickScan?: string
  lastFullScan?: string
  threats?: ThreatItem[]
}

/** Amenaza conocida por Defender (Get-MpThreat). */
export interface ThreatItem {
  name: string
  severity?: number
  active?: boolean
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/** Interpreta valores "booleanos" de PowerShell: true, 1, "True", "1". */
function truthy(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return /^(true|1|yes)$/i.test(v.trim())
  return undefined
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Normaliza una fecha de PowerShell a ISO. Windows PowerShell 5.1 serializa
 * DateTime como `/Date(ms)/`; PS7 la deja en ISO. Devuelve undefined si es el
 * centinela de "nunca" (año 1) o no se puede interpretar.
 */
function psDate(v: unknown): string | undefined {
  let ms: number | undefined
  if (typeof v === 'string') {
    const m = v.match(/\/Date\((-?\d+)\)\//)
    if (m) ms = Number(m[1])
    else {
      const t = Date.parse(v)
      if (Number.isFinite(t)) ms = t
    }
  }
  if (ms === undefined || !Number.isFinite(ms)) return undefined
  // Fechas anteriores a 2001 = centinela "nunca escaneado".
  if (ms < 978307200000) return undefined
  return new Date(ms).toISOString()
}

export function readPosture(hardware: Json | null): Posture {
  const hw = obj(hardware) ?? {}
  const p: Posture = {}

  if (typeof hw.disk_encrypted === 'boolean') p.diskEncrypted = hw.disk_encrypted

  const up = num(hw.uptime_seconds)
  if (up !== undefined) p.uptimeDays = Math.floor(up / 86400)

  const total = num(hw.disk_total_bytes)
  const free = num(hw.disk_free_bytes)
  if (total && free !== undefined && total > 0) {
    p.diskUsedPct = Math.round(((total - free) / total) * 100)
  }

  const sec = obj(hw.security)
  if (sec) {
    if (typeof sec.pending_reboot !== 'undefined') p.pendingReboot = truthy(sec.pending_reboot)
    const av = obj(sec.antivirus)
    if (av) {
      p.antivirusEnabled = truthy(av.AntivirusEnabled)
      p.realtimeEnabled = truthy(av.RealTimeProtectionEnabled)
      p.signatureAgeDays = num(av.AntivirusSignatureAge)
      p.lastQuickScan = psDate(av.QuickScanEndTime)
      p.lastFullScan = psDate(av.FullScanEndTime)
    }
    // amenazas: puede venir como objeto unico o arreglo de {ThreatName, SeverityID, IsActive}.
    const th = sec.threats
    const rawThreats = Array.isArray(th) ? th : th ? [th] : []
    const threats = rawThreats
      .map((t): ThreatItem | undefined => {
        const o = obj(t)
        const name = o?.ThreatName
        if (typeof name !== 'string' || name.trim() === '') return undefined
        return { name, severity: num(o?.SeverityID), active: truthy(o?.IsActive) }
      })
      .filter((t): t is ThreatItem => t !== undefined)
    if (threats.length > 0) p.threats = threats
    // firewall puede venir como arreglo de perfiles {Name, Enabled} o un objeto.
    const fw = sec.firewall
    const perfiles = Array.isArray(fw) ? fw : fw ? [fw] : []
    if (perfiles.length > 0) {
      p.firewallOn = perfiles.every((x) => truthy(obj(x)?.Enabled) === true)
    }
  }
  return p
}

export interface HealthFlag {
  label: string
  tone: 'critical' | 'warning'
}

/** Problemas de postura/salud, del mas grave al menos. Vacio = todo en orden. */
export function healthFlags(p: Posture): HealthFlag[] {
  const flags: HealthFlag[] = []
  if (p.diskEncrypted === false) flags.push({ label: 'Disco sin cifrar', tone: 'critical' })
  const amenazasActivas = (p.threats ?? []).filter((t) => t.active).length
  if (amenazasActivas > 0)
    flags.push({
      label: `${amenazasActivas} amenaza${amenazasActivas > 1 ? 's' : ''} activa${amenazasActivas > 1 ? 's' : ''}`,
      tone: 'critical',
    })
  if (p.antivirusEnabled === false) flags.push({ label: 'Antivirus desactivado', tone: 'critical' })
  if (p.realtimeEnabled === false) flags.push({ label: 'Proteccion en tiempo real off', tone: 'critical' })
  if (p.firewallOn === false) flags.push({ label: 'Cortafuegos desactivado', tone: 'critical' })
  if ((p.signatureAgeDays ?? 0) > 7) flags.push({ label: 'Firmas de antivirus desactualizadas', tone: 'warning' })
  if (p.pendingReboot) flags.push({ label: 'Reinicio pendiente', tone: 'warning' })
  if ((p.diskUsedPct ?? 0) >= 90) flags.push({ label: 'Disco casi lleno', tone: 'warning' })
  if ((p.uptimeDays ?? 0) >= 30) flags.push({ label: `Sin reiniciar ${p.uptimeDays} dias`, tone: 'warning' })
  return flags
}
