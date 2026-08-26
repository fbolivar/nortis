import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import {
  Badge,
  Button,
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
import { formatDateTime } from '@/lib/utils'
import { parsePolicyConfig } from '@/shared/schemas/policy'

/** Resumen de una politica en una linea: que canales intervienen de verdad. */
function activeChannels(config: ReturnType<typeof parsePolicyConfig>): string[] {
  const active: string[] = []
  if (config.storage.allowed_paths.length || config.storage.blocked_extensions.length)
    active.push('Guardado')
  if (config.apps.mode !== 'allow') active.push('Aplicaciones')
  if (config.usb.mode !== 'allow') active.push('USB')
  if (
    config.web.blocked_domains.length ||
    config.web.allowed_domains.length ||
    config.web.block_webmail
  )
    active.push('Web')
  if (config.clipboard.mode !== 'allow') active.push('Portapapeles')
  if (config.printing.mode !== 'allow') active.push('Impresion')
  if (config.classification.watched.length) active.push('Clasificacion')
  if (config.encryption.confidential_paths.length) active.push('Cifrado')
  if (config.monitoring.window_titles || config.monitoring.screenshots)
    active.push('Monitoreo')
  return active
}

export default async function PoliciesPage() {
  const supabase = await createClient()
  const session = await getSessionContext()
  const canEdit = session?.role === 'owner' || session?.role === 'admin'

  const [{ data: profiles, error }, { data: endpoints }] = await Promise.all([
    supabase.from('security_profiles').select('*').order('name'),
    supabase.from('endpoints').select('id, assigned_profile_id'),
  ])

  if (error) {
    return (
      <>
        <PageHeader title="Politicas" description="Perfiles de seguridad" />
        <div className="page-body">
          <Callout tone="critical" title="No se pudieron cargar las politicas">
            {error.message}
          </Callout>
        </div>
      </>
    )
  }

  const list = profiles ?? []
  const assignedByProfile = new Map<string, number>()
  for (const endpoint of endpoints ?? []) {
    if (endpoint.assigned_profile_id) {
      assignedByProfile.set(
        endpoint.assigned_profile_id,
        (assignedByProfile.get(endpoint.assigned_profile_id) ?? 0) + 1
      )
    }
  }
  const unassigned = (endpoints ?? []).filter((e) => !e.assigned_profile_id).length
  const hasDefault = list.some((p) => p.is_default)

  return (
    <>
      <PageHeader
        title="Politicas"
        description="Perfiles de seguridad que aplican los agentes"
        actions={
          canEdit ? (
            <Link href="/policies/new">
              <Button size="sm">Nuevo perfil</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="page-body space-y-6">
        {list.length > 0 && !hasDefault ? (
          <Callout tone="warning" title="Sin perfil por defecto">
            Los equipos que se registren de aqui en adelante quedaran sin ninguna regla
            aplicada hasta que alguien les asigne un perfil a mano.
          </Callout>
        ) : null}

        {unassigned > 0 ? (
          <Callout tone="warning" title={`${unassigned} ${unassigned === 1 ? 'equipo sin politica' : 'equipos sin politica'}`}>
            No se les aplica ninguna regla de DLP.{' '}
            <Link href="/endpoints" className="text-foreground underline underline-offset-2">
              Ver equipos
            </Link>
          </Callout>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Perfiles ({list.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {list.length === 0 ? (
              <EmptyState
                title="Sin perfiles de seguridad"
                description="Un perfil define que puede hacer el usuario en su equipo: donde guardar, que dispositivos conectar, a que sitios navegar. Sin ninguno, los agentes solo observan y no intervienen."
                action={
                  canEdit ? (
                    <Link href="/policies/new">
                      <Button size="sm">Crear el primer perfil</Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Perfil</Th>
                    <Th>Canales activos</Th>
                    <Th>Equipos</Th>
                    <Th>Modificado</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((profile) => {
                    const channels = activeChannels(parsePolicyConfig(profile.config))
                    const count = assignedByProfile.get(profile.id) ?? 0
                    return (
                      <tr key={profile.id} className="hover:bg-surface-muted">
                        <Td>
                          <Link
                            href={`/policies/${profile.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {profile.name}
                          </Link>
                          {profile.is_default ? (
                            <Badge tone="info" className="ml-2">
                              Por defecto
                            </Badge>
                          ) : null}
                          {profile.description ? (
                            <span className="block text-xs text-muted-foreground">
                              {profile.description}
                            </span>
                          ) : null}
                        </Td>
                        <Td>
                          {channels.length === 0 ? (
                            <Badge tone="warning">Solo observa</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {channels.join(' · ')}
                            </span>
                          )}
                        </Td>
                        <Td className="tabular-nums">{count}</Td>
                        <Td className="text-muted-foreground tabular-nums">
                          {formatDateTime(profile.updated_at)}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
