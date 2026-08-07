'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
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
import type { AppRole } from '@/shared/types/database'

export interface InvitationRow {
  id: string
  email: string
  role: AppRole
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  viewer: 'Solo lectura',
}

export function InvitationsPanel({
  invitations,
  canInvite,
  isOwner,
}: {
  invitations: InvitationRow[]
  canInvite: boolean
  isOwner: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('viewer')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [link, setLink] = useState<string>()
  const [copied, setCopied] = useState(false)

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    if (!email.includes('@')) {
      setError('Introduzca un correo valido')
      return
    }

    setPending(true)
    const supabase = createClient()

    // El token se genera dentro de Postgres y vuelve una sola vez, igual que las
    // API keys: no pasa por el servidor de la aplicacion ni por sus logs.
    const { data, error: rpcError } = await supabase.rpc('create_invitation', {
      p_email: email.trim(),
      p_role: role,
      p_days: 7,
    })
    setPending(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    const created = Array.isArray(data) ? data[0] : data
    if (created?.token) {
      setLink(`${window.location.origin}/invite/${created.token}`)
      setEmail('')
      router.refresh()
    }
  }

  async function revoke(id: string) {
    setError(undefined)
    setPending(true)
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

    const { error: updateError } = await supabase
      .from('invitations')
      .update({ revoked_at: new Date().toISOString(), revoked_by: userData.user?.id ?? null })
      .eq('id', id)

    setPending(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    router.refresh()
  }

  async function copyLink() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pendientes = invitations.filter((i) => !i.accepted_at && !i.revoked_at)

  return (
    <div className="space-y-4">
      {link ? (
        <Callout tone="warning" title="Enlace de invitacion generado">
          <p className="mb-2">
            Nortis <strong>no envia correos todavia</strong>: entregue este enlace usted
            mismo. Solo funciona para la cuenta del correo invitado, asi que reenviarlo por
            error no da acceso a nadie mas — pero caduca en 7 dias.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs">
              {link}
            </code>
            <Button size="sm" variant="secondary" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <button
            onClick={() => setLink(undefined)}
            className="mt-2 text-xs underline underline-offset-2"
          >
            Ya lo entregue, ocultar
          </button>
        </Callout>
      ) : null}

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitar a la organizacion</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Label htmlFor="inviteEmail">Correo</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analista@suempresa.com"
                />
              </div>
              <div>
                <Label htmlFor="inviteRole">Rol</Label>
                <select
                  id="inviteRole"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AppRole)}
                  className="h-9 rounded-md border border-border bg-input px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="viewer">Solo lectura</option>
                  {/* Solo el owner reparte el rol de administrador: un admin que
                      pudiera nombrar a otro escalaria privilegios de lado. */}
                  {isOwner ? <option value="admin">Administrador</option> : null}
                </select>
              </div>
              <Button type="submit" disabled={pending}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                {pending ? 'Generando…' : 'Invitar'}
              </Button>
            </form>
            <FormError>{error}</FormError>
            {!isOwner ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Solo el propietario puede invitar administradores.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Invitaciones ({pendientes.length} pendientes)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invitations.length === 0 ? (
            <EmptyState
              title="Sin invitaciones"
              description="Invite a un colega para que revise incidentes o audite politicas sin compartir su propia cuenta."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Correo</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                  <Th>Vence</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const expired = new Date(inv.expires_at) < new Date()
                  const vigente = !inv.accepted_at && !inv.revoked_at && !expired
                  return (
                    <tr key={inv.id} className="hover:bg-surface-muted/50">
                      <Td>{inv.email}</Td>
                      <Td className="text-muted-foreground">{ROLE_LABEL[inv.role]}</Td>
                      <Td>
                        {inv.accepted_at ? (
                          <Badge tone="success">Aceptada</Badge>
                        ) : inv.revoked_at ? (
                          <Badge tone="critical">Revocada</Badge>
                        ) : expired ? (
                          <Badge tone="neutral">Vencida</Badge>
                        ) : (
                          <Badge tone="warning">Pendiente</Badge>
                        )}
                      </Td>
                      <Td className="text-muted-foreground tabular-nums">
                        {formatDateTime(inv.expires_at)}
                      </Td>
                      <Td className="text-right">
                        {vigente && canInvite ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revoke(inv.id)}
                            disabled={pending}
                          >
                            Revocar
                          </Button>
                        ) : null}
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
  )
}
