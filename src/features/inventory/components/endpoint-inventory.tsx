'use client'

import { useMemo, useState } from 'react'
import { Cpu, HardDrive, MemoryStick, Server, ShieldCheck, ShieldOff, ShieldQuestion } from 'lucide-react'
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

export function EndpointInventory({
  hardware,
  inventoryAt,
  software,
}: {
  hardware: Json | null
  inventoryAt: string | null
  software: SoftwareRow[]
}) {
  const [query, setQuery] = useState('')

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
          <CardTitle>Software instalado ({software.length})</CardTitle>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar programa o publicador…"
            className="mt-3 w-full max-w-sm rounded-lg border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary"
          />
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
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={`${s.name}-${s.version ?? ''}-${i}`} className="hover:bg-surface-muted">
                      <Td className="font-medium">{s.name}</Td>
                      <Td className="tabular-nums text-muted-foreground">{s.version ?? '—'}</Td>
                      <Td className="text-muted-foreground">{s.publisher ?? '—'}</Td>
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
