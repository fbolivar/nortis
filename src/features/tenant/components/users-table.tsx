'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormError,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import type { AppRole, ConsoleUser } from '@/shared/types/database'

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  viewer: 'Solo lectura',
}

export function UsersTable({
  users,
  currentUserId,
  isOwner,
}: {
  users: ConsoleUser[]
  currentUserId: string
  isOwner: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [pendingId, setPendingId] = useState<string>()

  async function changeRole(userId: string, role: AppRole) {
    setError(undefined)
    setPendingId(userId)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)

    setPendingId(undefined)

    if (updateError) {
      // El trigger enforce_user_update_rules devuelve mensajes ya redactados
      // para el usuario final ("Solo el owner puede modificar roles", "El owner
      // no puede degradarse a si mismo"), asi que se muestran tal cual.
      setError(updateError.message)
      return
    }
    router.refresh()
  }

  const adminsWithoutMfa = users.filter(
    (u) => (u.role === 'owner' || u.role === 'admin') && !u.mfa_enabled
  ).length

  return (
    <div className="max-w-4xl space-y-5">
      {adminsWithoutMfa > 0 ? (
        <Callout tone="warning" title="Administradores sin segundo factor">
          {adminsWithoutMfa}{' '}
          {adminsWithoutMfa === 1 ? 'usuario administrador no tiene' : 'usuarios administradores no tienen'}{' '}
          MFA configurado. Hasta que lo activen, la base de datos les niega el acceso a
          todos los datos de la organizacion — pueden iniciar sesion, pero no veran nada.
        </Callout>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Usuarios de consola ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Segundo factor</Th>
                <Th>Alta</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId
                // El owner no puede degradarse a si mismo: dejaria el tenant sin
                // nadie capaz de gestionar credenciales ni consentimiento.
                const editable = isOwner && !(isSelf && user.role === 'owner')

                return (
                  <tr key={user.id} className="hover:bg-surface-muted/50">
                    <Td>
                      <div className="flex flex-col">
                        <span>{user.full_name ?? user.email}</span>
                        {user.full_name ? (
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      {editable ? (
                        <select
                          value={user.role}
                          disabled={pendingId === user.id}
                          onChange={(e) => changeRole(user.id, e.target.value as AppRole)}
                          className="h-7 rounded-md border border-border bg-input px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="owner">Propietario</option>
                          <option value="admin">Administrador</option>
                          <option value="viewer">Solo lectura</option>
                        </select>
                      ) : (
                        <Badge tone={user.role === 'viewer' ? 'neutral' : 'info'}>
                          {ROLE_LABEL[user.role]}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {user.role === 'viewer' && !user.mfa_enabled ? (
                        <span className="text-xs text-muted-foreground">Opcional</span>
                      ) : user.mfa_enabled ? (
                        <Badge tone="success">Activo</Badge>
                      ) : (
                        <Badge tone="warning">Pendiente</Badge>
                      )}
                    </Td>
                    <Td className="text-muted-foreground tabular-nums">
                      {formatDateTime(user.created_at)}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <FormError>{error}</FormError>

      <Callout tone="neutral" title="Invitaciones pendientes de implementar">
        Por ahora no hay forma de sumar a un segundo usuario a esta organizacion. Quien
        se registre por su cuenta creara <strong>su propia organizacion</strong>, no se
        unira a esta. Falta la tabla de invitaciones, que no forma parte del modelo de
        datos aprobado.
      </Callout>
    </div>
  )
}
