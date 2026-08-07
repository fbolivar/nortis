'use client'

import { useState } from 'react'
import { Download, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormError,
  Input,
  Label,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import { EventTypeBadge, formatBytes } from './event-row'
import type { Endpoint, EventType } from '@/shared/types/database'

interface TraceRow {
  id: string
  endpoint_id: string
  hostname: string
  event_type: EventType
  path: string | null
  file_user: string | null
  process: string | null
  size_bytes: number | null
  occurred_at: string
}

const RANGES = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
] as const

/**
 * Escapa un valor para CSV.
 *
 * Las rutas de Windows llevan comillas, comas y punto y coma con frecuencia; sin
 * escapar, un solo nombre de archivo con coma desplaza todas las columnas de esa
 * fila y el reporte deja de ser evidencia utilizable.
 */
function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function FileTrace({ endpoints }: { endpoints: Pick<Endpoint, 'id' | 'hostname'>[] }) {
  const [query, setQuery] = useState('')
  const [days, setDays] = useState<number>(30)
  const [endpointId, setEndpointId] = useState('')
  const [user, setUser] = useState('')
  const [rows, setRows] = useState<TraceRow[]>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setPending(true)

    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('search_file_activity', {
      p_query: query.trim(),
      p_days: days,
      p_endpoint: endpointId || null,
      p_user: user.trim() || null,
      p_limit: 500,
    })

    setPending(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setRows((data ?? []) as TraceRow[])
  }

  function exportCsv() {
    if (!rows?.length) return

    const header = ['Momento', 'Equipo', 'Evento', 'Ruta', 'Usuario', 'Proceso', 'Bytes']
    const body = rows.map((r) => [
      r.occurred_at,
      r.hostname,
      r.event_type,
      r.path ?? '',
      r.file_user ?? '',
      r.process ?? '',
      r.size_bytes ?? '',
    ])

    // BOM UTF-8: sin el, Excel en Windows abre el archivo en ANSI y destroza las
    // tildes de nombres y rutas. Un reporte forense con "Nmina" no sirve.
    const csv =
      '\uFEFF' + [header, ...body].map((row) => row.map(csvCell).join(';')).join('\r\n')

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `nortis-trazabilidad-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Buscar movimientos de archivos</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={runSearch} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Label htmlFor="q">Ruta o nombre de archivo</Label>
              <Input
                id="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="nomina, .xlsx, D:\Compartido…"
                className="font-mono"
              />
            </div>

            <div>
              <Label htmlFor="endpoint">Equipo</Label>
              <select
                id="endpoint"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos</option>
                {endpoints.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.hostname}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="user">Usuario de Windows</Label>
              <Input
                id="user"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="jperez"
                className="font-mono"
              />
            </div>

            <div>
              <Label htmlFor="days">Periodo</Label>
              <select
                id="days"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {RANGES.map((r) => (
                  <option key={r.days} value={r.days}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-5">
              <Button type="submit" disabled={pending}>
                <Search className="h-3.5 w-3.5" aria-hidden />
                {pending ? 'Buscando…' : 'Buscar'}
              </Button>
              <FormError>{error}</FormError>
            </div>
          </form>

          <p className="mt-3 text-xs text-muted-foreground">
            La retencion de telemetria detallada es de 90 dias. Para periodos
            anteriores solo quedan los agregados diarios.
          </p>
        </CardContent>
      </Card>

      {rows ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                Resultados ({rows.length}
                {rows.length === 500 ? ' — limite alcanzado' : ''})
              </CardTitle>
              {rows.length > 0 ? (
                <Button size="sm" variant="secondary" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Exportar CSV
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState
                title="Sin coincidencias"
                description="Ningun movimiento de archivo coincide con esos criterios en el periodo seleccionado. Pruebe ampliando el rango de fechas o acortando el termino de busqueda."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Momento</Th>
                    <Th>Equipo</Th>
                    <Th>Evento</Th>
                    <Th>Ruta</Th>
                    <Th>Usuario</Th>
                    <Th>Tamaño</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-muted/50">
                      <Td className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDateTime(row.occurred_at)}
                      </Td>
                      <Td>{row.hostname}</Td>
                      <Td>
                        <EventTypeBadge type={row.event_type} />
                      </Td>
                      <Td className="forensic max-w-md truncate" title={row.path ?? ''}>
                        {row.path ?? '—'}
                      </Td>
                      <Td className="text-muted-foreground">{row.file_user ?? '—'}</Td>
                      <Td className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatBytes(row.size_bytes)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
