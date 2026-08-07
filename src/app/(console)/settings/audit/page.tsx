import { createClient } from '@/lib/supabase/server'
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
import { formatDateTime } from '@/lib/utils'

/** Acciones que merecen destacarse visualmente en una auditoria. */
const ACTION_TONE: Record<string, 'critical' | 'warning' | 'info' | 'neutral'> = {
  'organizations.consent_granted': 'warning',
  'organizations.consent_revoked': 'critical',
  'api_key.created': 'info',
  'api_key.revoked': 'critical',
  'security_profiles.delete': 'critical',
  'security_profiles.insert': 'info',
  'security_profiles.update': 'warning',
  'users.update': 'warning',
}

const ACTION_LABEL: Record<string, string> = {
  'organizations.consent_granted': 'Autorizacion de monitoreo registrada',
  'organizations.consent_revoked': 'Autorizacion de monitoreo revocada',
  'organizations.update': 'Organizacion modificada',
  'api_key.created': 'Credencial de agente generada',
  'api_key.revoked': 'Credencial de agente revocada',
  'api_key.updated': 'Credencial de agente modificada',
  'security_profiles.insert': 'Politica creada',
  'security_profiles.update': 'Politica modificada',
  'security_profiles.delete': 'Politica eliminada',
  'endpoints.update': 'Equipo modificado',
  'endpoints.delete': 'Equipo dado de baja',
  'users.update': 'Usuario modificado',
  'users.delete': 'Usuario eliminado',
  'encrypted_documents.update': 'Documento cifrado modificado',
  'encrypted_documents.delete': 'Documento cifrado eliminado',
}

export default async function AuditPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(200)

  if (error) {
    return (
      <Callout tone="critical" title="No se pudo cargar el registro de auditoria">
        {error.message}
      </Callout>
    )
  }

  const entries = data ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Registro de auditoria</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState
              title="Sin actividad administrativa registrada"
              description="Cada cambio de politica, credencial o rol queda asentado aqui automaticamente."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Accion</Th>
                  <Th>Autor</Th>
                  <Th>Objeto</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-muted/50">
                    <Td className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatDateTime(entry.occurred_at)}
                    </Td>
                    <Td>
                      <Badge tone={ACTION_TONE[entry.action] ?? 'neutral'}>
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </Badge>
                    </Td>
                    <Td className="text-muted-foreground">
                      {entry.actor_email ?? 'sistema'}
                    </Td>
                    <Td className="forensic">
                      {entry.target_table}
                      {entry.target_id ? `:${entry.target_id.slice(0, 8)}` : ''}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Este registro es inmutable: no admite modificacion ni borrado, ni siquiera desde
        el backend con privilegios elevados. Se muestran los ultimos 200 asientos.
      </p>
    </div>
  )
}
