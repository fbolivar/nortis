import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Table, Td, Th } from '@/shared/components/ui'
import { formatRelative } from '@/lib/utils'

export interface ConnectedDevice {
  serial: string | null
  label: string | null
  vendor_id: string | null
  product_id: string | null
  capacity_bytes: number | null
  enforcement: string | null
  veces: number
  last_seen: string
}

/** Bytes -> unidad legible. Sin dato, un guion; no un "0 B" que parece un fallo. */
function capacidad(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  const gb = bytes / 1e9
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`
}

/**
 * Tabla de dispositivos externos vistos en el parque, uno por serial.
 *
 * El serial es la columna que importa: es la clave de las listas blancas de USB.
 * El fabricante se muestra como vendor:product (los identificadores USB); el
 * nombre comercial exigiria una tabla de VID/PID que hoy no se empotra.
 */
export function ConnectedDevices({ rows }: { rows: ConnectedDevice[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispositivos externos conectados</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="Ningun dispositivo externo"
            description="Cuando se conecte un USB a un equipo con agente aparecera aqui: serial, fabricante, capacidad y la accion que aplico la politica."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Dispositivo</Th>
                  <Th>Serial</Th>
                  <Th>Fabricante (VID:PID)</Th>
                  <Th>Capacidad</Th>
                  <Th>Accion</Th>
                  <Th>Ultima conexion</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.serial ?? i} className="hover:bg-surface-muted">
                    <Td>{r.label ?? 'Dispositivo USB'}</Td>
                    <Td className="forensic">{r.serial ?? '—'}</Td>
                    <Td className="text-muted-foreground">
                      {r.vendor_id ? `${r.vendor_id}${r.product_id ? `:${r.product_id}` : ''}` : '—'}
                    </Td>
                    <Td>{capacidad(r.capacity_bytes)}</Td>
                    <Td>
                      {r.enforcement === 'block' ? (
                        <Badge tone="critical">Bloqueado</Badge>
                      ) : r.enforcement === 'read_only' ? (
                        <Badge tone="warning">Solo lectura</Badge>
                      ) : (
                        <span className="text-muted-foreground">Permitido</span>
                      )}
                    </Td>
                    <Td className="text-muted-foreground">{formatRelative(r.last_seen)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
