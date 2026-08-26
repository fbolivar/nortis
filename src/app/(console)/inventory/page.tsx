import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/shared/components/console-shell'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'

const RESULT_LIMIT = 300

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const supabase = await createClient()

  // Solo se consulta con un termino: el inventario completo de la flota puede ser
  // enorme, y "quien tiene X" es justo la pregunta que esta pantalla resuelve.
  const { data: rows } =
    query.length >= 2
      ? await supabase
          .from('endpoint_software')
          .select('name, version, endpoint_id, endpoints(hostname)')
          .ilike('name', `%${query}%`)
          .order('name')
          .limit(RESULT_LIMIT)
      : { data: null }

  const results = (rows ?? []) as unknown as {
    name: string
    version: string | null
    endpoint_id: string
    endpoints: { hostname: string } | null
  }[]

  return (
    <>
      <PageHeader
        title="Inventario de software"
        description="Busca un programa y descubre en que equipos esta instalado"
      />

      <div className="page-body space-y-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[16rem]">
            <span className="mb-1 block text-xs text-muted-foreground">Programa</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="p. ej. Chrome, AnyDesk, Office…"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary"
            />
          </label>
          <button
            type="submit"
            className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Buscar
          </button>
        </form>

        {query.length < 2 ? (
          <Card>
            <CardContent className="py-2">
              <EmptyState
                title="Busca un programa"
                description="Escribe al menos dos letras del nombre de un programa para ver en que equipos esta instalado. El inventario se refresca desde cada agente cada pocas horas."
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                Resultados para “{query}” ({results.length}
                {results.length === RESULT_LIMIT ? '+' : ''})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {results.length === 0 ? (
                <div className="p-2">
                  <EmptyState
                    title="Ningun equipo tiene ese programa"
                    description="No hay coincidencias en el inventario reportado. Prueba con parte del nombre."
                  />
                </div>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Programa</Th>
                      <Th>Version</Th>
                      <Th>Equipo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={`${r.endpoint_id}-${r.name}-${i}`} className="hover:bg-surface-muted">
                        <Td className="font-medium">{r.name}</Td>
                        <Td className="tabular-nums text-muted-foreground">{r.version ?? '—'}</Td>
                        <Td>
                          <Link
                            href={`/endpoints/${r.endpoint_id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {r.endpoints?.hostname ?? '—'}
                          </Link>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
