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
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { FilterBar, FilterSearch, FilterSelect } from '@/shared/components/filter-bar'
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

  // El periodo no cuenta como filtro activo: siempre tiene un valor y contarlo
  // dejaria el marcador anclado en 1, que es lo mismo que no informar.
  const activeFilters =
    (query.trim() ? 1 : 0) + (endpointId ? 1 : 0) + (user.trim() ? 1 : 0)

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
          {/*
            Barra de pastillas en vez de una rejilla de campos etiquetados: son
            cuatro criterios opcionales, no un formulario de alta. La etiqueta de
            cada control vive en `aria-label` y en el placeholder — visible para
            quien mira, anunciada para quien no.
          */}
          <form onSubmit={runSearch}>
            <FilterBar activeCount={activeFilters}>
              <FilterSearch
                label="Ruta o nombre de archivo"
                value={query}
                onChange={setQuery}
                placeholder="nomina, .xlsx, D:\Compartido…"
                className="min-w-[12rem] flex-1 sm:max-w-sm"
                inputClassName="font-mono"
              />
              <FilterSelect
                label="Equipo"
                value={endpointId}
                onChange={setEndpointId}
                options={[
                  { value: '', label: 'Todos los equipos' },
                  ...endpoints.map((e) => ({ value: e.id, label: e.hostname })),
                ]}
              />
              <FilterSearch
                label="Usuario de Windows"
                value={user}
                onChange={setUser}
                placeholder="Usuario…"
                className="w-40"
                inputClassName="font-mono"
              />
              <FilterSelect
                label="Periodo"
                value={String(days)}
                onChange={(value) => setDays(Number(value))}
                options={RANGES.map((r) => ({ value: String(r.days), label: r.label }))}
              />
              {/* `h-10` para igualar la altura de las pastillas: un boton de 36px
                  en una fila de controles de 40px descuadra la linea base. */}
              <Button type="submit" size="sm" className="h-10" disabled={pending}>
                <Search className="h-3.5 w-3.5" aria-hidden />
                {pending ? 'Buscando…' : 'Buscar'}
              </Button>
            </FilterBar>
            <FormError>{error}</FormError>
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
                    <tr key={row.id} className="hover:bg-surface-muted">
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
