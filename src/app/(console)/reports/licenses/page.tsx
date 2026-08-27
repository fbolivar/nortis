import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/shared/components/console-shell'
import { StatTile } from '@/shared/components/stat-tile'
import {
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { matchLicense } from '@/features/inventory/lib/licenses'

/**
 * Inventario de licencias: cruza el software instalado en la flota contra el
 * catalogo de productos licenciables y cuenta instalaciones por producto. Sirve
 * para controlar cumplimiento de licencias y costos (cuantas licencias de Office,
 * Adobe, etc. hacen falta de verdad).
 */
export default async function LicensesPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('endpoint_software')
    .select('name, endpoint_id, endpoints(hostname)')
    .limit(20000)

  if (error) {
    return (
      <>
        <PageHeader title="Licencias" description="Software licenciable en la flota" />
        <div className="page-body">
          <Callout tone="critical" title="No se pudo cargar el inventario">
            {error.message}
          </Callout>
        </div>
      </>
    )
  }

  type Row = { name: string; endpoint_id: string; endpoints: { hostname: string } | null }
  const rows = (data ?? []) as unknown as Row[]

  // product -> { vendor, endpoints: Set<endpoint_id>, hostnames: Set<hostname> }
  const acc = new Map<string, { vendor: string; endpoints: Set<string>; hostnames: Set<string> }>()
  for (const r of rows) {
    const m = matchLicense(r.name)
    if (!m) continue
    let e = acc.get(m.product)
    if (!e) {
      e = { vendor: m.vendor, endpoints: new Set(), hostnames: new Set() }
      acc.set(m.product, e)
    }
    e.endpoints.add(r.endpoint_id)
    if (r.endpoints?.hostname) e.hostnames.add(r.endpoints.hostname)
  }

  const productos = [...acc.entries()]
    .map(([product, v]) => ({
      product,
      vendor: v.vendor,
      count: v.endpoints.size,
      hostnames: [...v.hostnames].sort((a, b) => a.localeCompare(b, 'es')),
    }))
    .sort((a, b) => b.count - a.count || a.product.localeCompare(b.product, 'es'))

  const totalInstalaciones = productos.reduce((s, p) => s + p.count, 0)

  return (
    <>
      <PageHeader
        title="Licencias"
        description="Software licenciable detectado en la flota, con el numero de equipos donde esta instalado"
      />

      <div className="page-body space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile label="Productos licenciables" value={productos.length} />
          <StatTile label="Instalaciones totales" value={totalInstalaciones} />
          <StatTile label="Equipos inventariados" value={new Set(rows.map((r) => r.endpoint_id)).size} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Productos</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cada instalacion cuenta como una licencia necesaria. El software gratuito no aparece.
            </p>
          </CardHeader>
          <CardContent>
            {productos.length === 0 ? (
              <EmptyState
                title="Sin software licenciable"
                description="No se detecto software de pago del catalogo en la flota."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Producto</Th>
                      <Th>Fabricante</Th>
                      <Th>Equipos</Th>
                      <Th>Instalado en</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p) => (
                      <tr key={p.product} className="hover:bg-surface-muted">
                        <Td className="font-medium">{p.product}</Td>
                        <Td className="text-muted-foreground">{p.vendor}</Td>
                        <Td className="tabular-nums">{p.count}</Td>
                        <Td className="text-xs text-muted-foreground">
                          {p.hostnames.slice(0, 8).join(', ')}
                          {p.hostnames.length > 8 ? ` +${p.hostnames.length - 8}` : ''}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
