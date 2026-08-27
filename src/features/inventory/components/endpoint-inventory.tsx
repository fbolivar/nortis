'use client'

import { useMemo, useState, useTransition } from 'react'
import { issueUninstall } from '@/features/tasks/services/tasks'
import { readPosture, healthFlags, readAccounts } from '@/features/inventory/lib/posture'
import {
  Cpu,
  HardDrive,
  MapPin,
  MemoryStick,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
  Wifi,
} from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { formatRelative } from '@/lib/utils'
import type { Json } from '@/shared/types/database'

export interface SoftwareRow {
  name: string
  version: string | null
  publisher: string | null
}

/** GB con un decimal a partir de bytes; '—' si no es un numero util. */
function gb(bytes: unknown): string {
  const n = typeof bytes === 'number' ? bytes : Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

interface NetInterface {
  name?: string
  ip?: string
  mac?: string
}

export function EndpointInventory({
  hardware,
  inventoryAt,
  software,
  publicIp,
  endpointId,
  canManage = false,
}: {
  hardware: Json | null
  inventoryAt: string | null
  software: SoftwareRow[]
  publicIp?: string | null
  endpointId?: string
  canManage?: boolean
}) {
  const [query, setQuery] = useState('')
  const [pending, startUninstall] = useTransition()
  const [uninstallMsg, setUninstallMsg] = useState<string>()

  function uninstall(name: string) {
    if (!endpointId) return
    if (!window.confirm(`Desinstalar "${name}" del equipo? La accion es remota y silenciosa.`)) return
    setUninstallMsg(undefined)
    startUninstall(async () => {
      const r = await issueUninstall({ endpointIds: [endpointId], name })
      const res = r.results[0]
      setUninstallMsg(res?.error ? `Error: ${res.error}` : `Desinstalacion de "${name}" enviada.`)
    })
  }

  const puedeDesinstalar = canManage && Boolean(endpointId)

  const postura = readPosture(hardware)
  const flags = healthFlags(postura)
  const cuentas = readAccounts(hardware)
  const si = (v?: boolean) => (v === undefined ? '—' : v ? 'Si' : 'No')

  const hw = (hardware && typeof hardware === 'object' && !Array.isArray(hardware)
    ? (hardware as Record<string, unknown>)
    : {}) as Record<string, unknown>

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = [...software].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    if (!needle) return rows
    return rows.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.publisher ?? '').toLowerCase().includes(needle)
    )
  }, [software, query])

  const encrypted =
    typeof hw['disk_encrypted'] === 'boolean' ? (hw['disk_encrypted'] as boolean) : undefined

  const net = (hw['network'] && typeof hw['network'] === 'object' && !Array.isArray(hw['network'])
    ? (hw['network'] as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const interfaces = (Array.isArray(net['interfaces']) ? net['interfaces'] : []) as NetInterface[]
  const wifiSsid = str(net['wifi_ssid'])
  const hasNetwork = interfaces.length > 0 || Boolean(wifiSsid) || Boolean(publicIp)

  const diskTotal = hw['disk_total_bytes']
  const diskFree = hw['disk_free_bytes']
  const diskUsed =
    typeof diskTotal === 'number' && typeof diskFree === 'number'
      ? diskTotal - diskFree
      : undefined

  if (!inventoryAt && software.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Sin inventario todavia"
            description="El agente reporta el software y hardware del equipo cada pocas horas. Si acaba de instalarse, aparecera en el proximo barrido."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>Hardware</CardTitle>
            {encrypted === true ? (
              <Badge tone="success">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
                Disco cifrado
              </Badge>
            ) : encrypted === false ? (
              <Badge tone="critical">
                <ShieldOff className="mr-1 h-3.5 w-3.5" aria-hidden />
                Sin cifrar
              </Badge>
            ) : (
              <Badge tone="neutral">
                <ShieldQuestion className="mr-1 h-3.5 w-3.5" aria-hidden />
                Cifrado sin datos
              </Badge>
            )}
          </div>
          {inventoryAt ? (
            <span className="text-xs text-muted-foreground">
              Actualizado {formatRelative(inventoryAt)}
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HwTile icon={Cpu} label="Procesador" value={str(hw['cpu']) ?? '—'}
              hint={typeof hw['cpu_cores'] === 'number' ? `${hw['cpu_cores']} núcleos` : undefined} />
            <HwTile icon={MemoryStick} label="Memoria" value={gb(hw['ram_bytes'])} />
            <HwTile
              icon={HardDrive}
              label="Disco"
              value={gb(diskTotal)}
              hint={diskUsed !== undefined ? `${gb(diskUsed)} en uso` : undefined}
            />
            <HwTile
              icon={Server}
              label="Equipo"
              value={str(hw['model']) ?? '—'}
              hint={str(hw['manufacturer']) ?? undefined}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Postura de seguridad y salud</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {flags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {flags.map((f) => (
                <span
                  key={f.label}
                  className={
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ' +
                    (f.tone === 'critical'
                      ? 'bg-critical-subtle text-critical'
                      : 'bg-warning-subtle text-warning')
                  }
                >
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                  {f.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-success">Sin alertas de seguridad ni de salud.</p>
          )}

          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <PostureItem label="Antivirus activo" value={si(postura.antivirusEnabled)} />
            <PostureItem label="Proteccion en tiempo real" value={si(postura.realtimeEnabled)} />
            <PostureItem
              label="Edad de firmas"
              value={postura.signatureAgeDays === undefined ? '—' : `${postura.signatureAgeDays} d`}
            />
            <PostureItem label="Cortafuegos" value={si(postura.firewallOn)} />
            <PostureItem label="Disco cifrado" value={si(postura.diskEncrypted)} />
            <PostureItem label="Reinicio pendiente" value={si(postura.pendingReboot)} />
            <PostureItem
              label="Uso de disco"
              value={postura.diskUsedPct === undefined ? '—' : `${postura.diskUsedPct}%`}
            />
            <PostureItem
              label="Encendido hace"
              value={postura.uptimeDays === undefined ? '—' : `${postura.uptimeDays} dias`}
            />
            <PostureItem label="Ultimo escaneo rapido" value={fechaCorta(postura.lastQuickScan)} />
            <PostureItem label="Ultimo escaneo completo" value={fechaCorta(postura.lastFullScan)} />
            <PostureItem label="Windows Update automatico" value={si(postura.autoUpdate)} />
            <PostureItem
              label="Actualizaciones pendientes"
              value={postura.pendingUpdates === undefined ? '—' : String(postura.pendingUpdates)}
            />
            <PostureItem label="Ultimo parche" value={fechaCorta(postura.lastPatch)} />
          </dl>

          {(postura.updateTitles ?? []).length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Actualizaciones pendientes
              </p>
              <ul className="space-y-1">
                {(postura.updateTitles ?? []).map((t, i) => (
                  <li key={`${t}-${i}`} className="text-sm text-muted-foreground">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {(postura.threats ?? []).length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Amenazas detectadas por el antivirus
              </p>
              <ul className="space-y-1">
                {(postura.threats ?? []).map((t, i) => (
                  <li
                    key={`${t.name}-${i}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-critical" aria-hidden />
                    <span className="font-mono">{t.name}</span>
                    <Badge tone={t.active ? 'critical' : 'neutral'}>
                      {t.active ? 'Activa' : 'Resuelta'}
                    </Badge>
                    {t.severity !== undefined ? (
                      <span className="text-xs text-muted-foreground">sev {t.severity}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cuentas && (cuentas.users.length > 0 || cuentas.admins.length > 0) ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Cuentas y accesos</CardTitle>
            {cuentas.failedLogons24h !== undefined ? (
              <Badge tone={cuentas.failedLogons24h > 0 ? 'warning' : 'neutral'}>
                {cuentas.failedLogons24h} inicio{cuentas.failedLogons24h === 1 ? '' : 's'} fallido
                {cuentas.failedLogons24h === 1 ? '' : 's'} (24 h)
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {cuentas.admins.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Administradores locales ({cuentas.admins.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cuentas.admins.map((a, i) => (
                    <Badge key={`${a}-${i}`} tone="info">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {cuentas.users.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Cuenta local</Th>
                      <Th>Estado</Th>
                      <Th>Rol</Th>
                      <Th>Ultimo inicio</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.users.map((u, i) => (
                      <tr key={`${u.name}-${i}`} className="hover:bg-surface-muted">
                        <Td className="font-medium">{u.name}</Td>
                        <Td>
                          {u.enabled === undefined ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Badge tone={u.enabled ? 'success' : 'neutral'}>
                              {u.enabled ? 'Habilitada' : 'Deshabilitada'}
                            </Badge>
                          )}
                        </Td>
                        <Td>
                          {u.isAdmin ? (
                            <Badge tone="warning">Administrador</Badge>
                          ) : (
                            <span className="text-muted-foreground">Usuario</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground tabular-nums">
                          {u.lastLogon ? formatRelative(u.lastLogon) : 'Nunca'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {hasNetwork ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Red</CardTitle>
            {wifiSsid ? (
              <Badge tone="info">
                <Wifi className="mr-1 h-3.5 w-3.5" aria-hidden />
                {wifiSsid}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {publicIp ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-muted px-4 py-3">
                <span className="text-xs text-muted-foreground">IP publica</span>
                <span className="font-mono text-sm">{publicIp}</span>
                {/* Geolocalizacion por IP: se abre un servicio externo en otra
                    pestaña. No se llama desde el servidor para no depender de un
                    tercero ni filtrar la IP sin que el usuario lo decida. */}
                <a
                  href={`https://ipinfo.io/${encodeURIComponent(publicIp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  Ubicar
                </a>
              </div>
            ) : null}

            {interfaces.length > 0 ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Interfaz</Th>
                    <Th>IP local</Th>
                    <Th>MAC</Th>
                  </tr>
                </thead>
                <tbody>
                  {interfaces.map((n, i) => (
                    <tr key={`${n.mac ?? ''}-${i}`} className="hover:bg-surface-muted">
                      <Td className="font-medium">{n.name ?? '—'}</Td>
                      <Td className="font-mono tabular-nums">{n.ip ?? '—'}</Td>
                      <Td className="font-mono text-muted-foreground">{n.mac ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Software instalado ({software.length})</CardTitle>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar programa o publicador…"
            className="mt-3 w-full max-w-sm rounded-lg border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary"
          />
          {uninstallMsg ? (
            <p className="mt-2 text-xs text-muted-foreground">{uninstallMsg}</p>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-2">
              <EmptyState
                title={software.length === 0 ? 'Sin software reportado' : 'Nada coincide'}
                description={
                  software.length === 0
                    ? 'El agente aun no ha reportado programas instalados.'
                    : 'Prueba con otro termino de busqueda.'
                }
              />
            </div>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <Table>
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    <Th>Programa</Th>
                    <Th>Version</Th>
                    <Th>Publicador</Th>
                    {puedeDesinstalar ? <Th className="w-24" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={`${s.name}-${s.version ?? ''}-${i}`} className="hover:bg-surface-muted">
                      <Td className="font-medium">{s.name}</Td>
                      <Td className="tabular-nums text-muted-foreground">{s.version ?? '—'}</Td>
                      <Td className="text-muted-foreground">{s.publisher ?? '—'}</Td>
                      {puedeDesinstalar ? (
                        <Td>
                          <button
                            type="button"
                            onClick={() => uninstall(s.name)}
                            disabled={pending}
                            className="rounded-md px-2 py-1 text-xs text-critical transition-colors hover:bg-critical-subtle disabled:opacity-50"
                          >
                            Desinstalar
                          </button>
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Fecha corta (dd/mm/aaaa) para las marcas de escaneo; "Nunca" si no hay. */
function fechaCorta(iso?: string): string {
  if (!iso) return 'Nunca'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es')
}

function PostureItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function HwTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </p>
      {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
