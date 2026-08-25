import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import {
  Badge,
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
import { formatRelative } from '@/lib/utils'
import { PublishReleaseForm } from '@/features/tenant/components/publish-release-form'

/**
 * Actualizaciones del agente.
 *
 * Publicar una version aqui la marca como la actual; los agentes de la flota la
 * descargan, verifican su sha256 y se actualizan solos. No hay que reinstalar
 * equipo por equipo.
 */
export default async function UpdatesPage() {
  const supabase = await createClient()
  const session = await getSessionContext()
  const canManage = session?.role === 'owner' || session?.role === 'admin'

  const [{ data: releases }, { data: endpoints }] = await Promise.all([
    supabase
      .from('agent_releases')
      .select('version, sha256, size_bytes, notes, is_current, published_at')
      .order('published_at', { ascending: false })
      .limit(20),
    supabase.from('endpoints').select('agent_version, hostname, last_seen_at'),
  ])

  const current = (releases ?? []).find((r) => r.is_current)

  // Flota agrupada por version en ejecucion: cuantos equipos corren cada una.
  const porVersion = new Map<string, number>()
  for (const e of endpoints ?? []) {
    const v = e.agent_version ?? '(desconocida)'
    porVersion.set(v, (porVersion.get(v) ?? 0) + 1)
  }
  const flota = [...porVersion.entries()].sort((a, b) => b[1] - a[1])
  const totalEquipos = endpoints?.length ?? 0

  return (
    <>
      <PageHeader
        title="Actualizaciones del agente"
        description="Publica una version y la flota se actualiza sola"
      />

      <div className="page-body space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Version actual</CardTitle>
          </CardHeader>
          <CardContent>
            {current ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="success">v{current.version}</Badge>
                <span className="forensic text-xs text-muted-foreground">
                  sha256 {current.sha256.slice(0, 16)}…
                </span>
                <span className="text-sm text-muted-foreground">
                  publicada {formatRelative(current.published_at)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay ninguna version publicada. Mientras tanto, los agentes no se
                auto-actualizan (la actualizacion queda «armada pero inactiva»).
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flota por version en ejecucion</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {totalEquipos === 0 ? (
              <EmptyState title="Sin equipos" description="Aun no hay agentes reportando." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Version</Th>
                    <Th>Equipos</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {flota.map(([version, n]) => (
                    <tr key={version}>
                      <Td className="forensic">{version}</Td>
                      <Td>
                        {n} de {totalEquipos}
                      </Td>
                      <Td>
                        {current && version === current.version ? (
                          <Badge tone="success">Al dia</Badge>
                        ) : current ? (
                          <Badge tone="warning">Desactualizada</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Publicar una version</CardTitle>
            </CardHeader>
            <CardContent>
              <Callout tone="info">
                Suba primero el MSI al bucket <strong>agent-dist</strong> (Storage). Luego indique
                aqui su nombre y la version: el servidor calcula el sha256 del binario y firma la
                descarga. La primera vez, el equipo debe tener ya un agente con auto-actualizador
                (una unica instalacion manual).
              </Callout>
              <div className="mt-4">
                <PublishReleaseForm />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}
