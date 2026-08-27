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
  pendingUpdates?: number
  updateTitles?: string[]
  lastPatch?: string
  autoUpdate?: boolean
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

  const upd = obj(hw.updates)
  if (upd) {
    const pending = obj(upd.pending)
    if (pending) {
      p.pendingUpdates = num(pending.count)
      const titles = Array.isArray(pending.titles) ? pending.titles : []
      const list = titles.filter((t): t is string => typeof t === 'string')
      if (list.length > 0) p.updateTitles = list
    }
    p.lastPatch = psDate(upd.last_hotfix)
    // AUOptions: 4 = descargar e instalar automaticamente, 5 = gestionado por
    // admin; ambos cuentan como "automatico". 1 = nunca comprobar (desactivado).
    const au = num(upd.au_options)
    if (au !== undefined) p.autoUpdate = au >= 4
  }
  return p
}

/* -------------------------------------------------------------------------- */
/* Auditoria de cuentas y accesos                                              */
/* -------------------------------------------------------------------------- */

export interface LocalUser {
  name: string
  enabled?: boolean
  lastLogon?: string
  isAdmin: boolean
}

export interface Accounts {
  users: LocalUser[]
  admins: string[]
  failedLogons24h?: number
}

/** Convierte un valor que PowerShell pudo serializar como objeto/arreglo unico. */
function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  return v === null || v === undefined ? [] : [v]
}

export function readAccounts(hardware: Json | null): Accounts | undefined {
  const hw = obj(hardware) ?? {}
  const acc = obj(hw.accounts)
  if (!acc) return undefined

  const admins = asArray(acc.admins)
    .map((a) => (typeof a === 'string' ? a : undefined))
    .filter((a): a is string => a !== undefined && a.trim() !== '')
  const adminSet = new Set(admins.map((a) => a.toLowerCase()))

  const users = asArray(acc.users)
    .map((u): LocalUser | undefined => {
      const o = obj(u)
      const name = o?.Name
      if (typeof name !== 'string' || name.trim() === '') return undefined
      const lastLogon = typeof o?.LastLogon === 'string' ? o.LastLogon : undefined
      // El nombre de un admin puede venir como "EQUIPO\\usuario"; se compara por la
      // parte final para casar con el usuario local.
      const short = name.includes('\\') ? name.slice(name.lastIndexOf('\\') + 1) : name
      const isAdmin =
        adminSet.has(name.toLowerCase()) || adminSet.has(short.toLowerCase())
      return { name, enabled: truthy(o?.Enabled), lastLogon, isAdmin }
    })
    .filter((u): u is LocalUser => u !== undefined)

  return { users, admins, failedLogons24h: num(acc.failed_logons_24h) }
}

/* -------------------------------------------------------------------------- */
/* Exposicion de red y persistencia                                            */
/* -------------------------------------------------------------------------- */

export interface ListeningPort {
  port: number
  address?: string
  process?: string
}

export interface SmbShare {
  name: string
  path?: string
}

export interface AutorunEntry {
  name: string
  command?: string
  location?: string
}

export interface Exposure {
  ports: ListeningPort[]
  shares: SmbShare[]
  autoruns: AutorunEntry[]
}

export function readExposure(hardware: Json | null): Exposure | undefined {
  const hw = obj(hardware) ?? {}

  const ports = asArray(hw.listening_ports)
    .map((p): ListeningPort | undefined => {
      const o = obj(p)
      const port = num(o?.port)
      if (port === undefined) return undefined
      return {
        port,
        address: typeof o?.address === 'string' ? o.address : undefined,
        process: typeof o?.process === 'string' && o.process !== '' ? o.process : undefined,
      }
    })
    .filter((x): x is ListeningPort => x !== undefined)
    .sort((a, b) => a.port - b.port)

  const shares = asArray(hw.shares)
    .map((s): SmbShare | undefined => {
      const o = obj(s)
      const name = o?.Name
      if (typeof name !== 'string' || name.trim() === '') return undefined
      return { name, path: typeof o?.Path === 'string' ? o.Path : undefined }
    })
    .filter((x): x is SmbShare => x !== undefined)

  const autoruns = asArray(hw.autoruns)
    .map((a): AutorunEntry | undefined => {
      const o = obj(a)
      const name = o?.name
      if (typeof name !== 'string' || name.trim() === '') return undefined
      return {
        name,
        command: typeof o?.command === 'string' ? o.command : undefined,
        location: typeof o?.location === 'string' ? o.location : undefined,
      }
    })
    .filter((x): x is AutorunEntry => x !== undefined)

  if (ports.length === 0 && shares.length === 0 && autoruns.length === 0) return undefined
  return { ports, shares, autoruns }
}

/* -------------------------------------------------------------------------- */
/* Historial USB, confianza y estado en vivo                                   */
/* -------------------------------------------------------------------------- */

export interface UsbDevice {
  name: string
  id?: string
}

export function readUsbHistory(hardware: Json | null): UsbDevice[] {
  const hw = obj(hardware) ?? {}
  return asArray(hw.usb_history)
    .map((d): UsbDevice | undefined => {
      const o = obj(d)
      const name = o?.name
      if (typeof name !== 'string' || name.trim() === '') return undefined
      return { name, id: typeof o?.id === 'string' ? o.id : undefined }
    })
    .filter((x): x is UsbDevice => x !== undefined)
}

export interface Trust {
  tpmPresent?: boolean
  tpmReady?: boolean
  secureBoot?: boolean
  expiringCerts: { subject: string; notAfter?: string }[]
}

export function readTrust(hardware: Json | null): Trust | undefined {
  const hw = obj(hardware) ?? {}
  const t = obj(hw.trust)
  if (!t) return undefined
  const tpm = obj(t.tpm)
  const certs = asArray(t.expiring_certs)
    .map((c): { subject: string; notAfter?: string } | undefined => {
      const o = obj(c)
      const subject = o?.subject
      if (typeof subject !== 'string' || subject.trim() === '') return undefined
      return { subject, notAfter: typeof o?.not_after === 'string' ? o.not_after : undefined }
    })
    .filter((c): c is { subject: string; notAfter?: string } => c !== undefined)
  return {
    tpmPresent: tpm ? truthy(tpm.present) : undefined,
    tpmReady: tpm ? truthy(tpm.ready) : undefined,
    secureBoot: t.secure_boot === null ? undefined : truthy(t.secure_boot),
    expiringCerts: certs,
  }
}

export interface Runtime {
  topProcesses: { name: string; ramMb?: number }[]
  activeUsers: string[]
}

export function readRuntime(hardware: Json | null): Runtime | undefined {
  const hw = obj(hardware) ?? {}
  const r = obj(hw.runtime)
  if (!r) return undefined
  const top = asArray(r.top_processes)
    .map((p): { name: string; ramMb?: number } | undefined => {
      const o = obj(p)
      const name = o?.name
      if (typeof name !== 'string' || name.trim() === '') return undefined
      return { name, ramMb: num(o?.ram_mb) }
    })
    .filter((p): p is { name: string; ramMb?: number } => p !== undefined)
  const users = asArray(r.active_users)
    .map((u) => (typeof u === 'string' ? u : undefined))
    .filter((u): u is string => u !== undefined && u.trim() !== '')
  if (top.length === 0 && users.length === 0) return undefined
  return { topProcesses: top, activeUsers: users }
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
  if (p.autoUpdate === false)
    flags.push({ label: 'Windows Update automatico desactivado', tone: 'warning' })
  if ((p.pendingUpdates ?? 0) > 0)
    flags.push({
      label: `${p.pendingUpdates} actualizacion${p.pendingUpdates === 1 ? '' : 'es'} pendiente${p.pendingUpdates === 1 ? '' : 's'}`,
      tone: 'warning',
    })
  if ((p.diskUsedPct ?? 0) >= 90) flags.push({ label: 'Disco casi lleno', tone: 'warning' })
  if ((p.uptimeDays ?? 0) >= 30) flags.push({ label: `Sin reiniciar ${p.uptimeDays} dias`, tone: 'warning' })
  return flags
}
