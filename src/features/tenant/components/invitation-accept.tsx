'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormError,
} from '@/shared/components/ui'
import type { AppRole } from '@/shared/types/database'

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  viewer: 'Solo lectura',
}

export interface InvitationPreview {
  organization_name: string
  email: string
  role: AppRole
  expires_at: string
}

/**
 * Aceptacion de una invitacion.
 *
 * La vista previa llega ya resuelta desde el servidor: no hay efecto de carga ni
 * estado intermedio. Ademas de ser mas rapido, evita el patron de pedir datos en
 * un useEffect y sembrar estado en cascada.
 */
export function InvitationAccept({
  token,
  preview,
  sessionEmail,
}: {
  token: string
  preview: InvitationPreview | null
  sessionEmail: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  async function accept() {
    setError(undefined)
    setPending(true)

    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc('accept_invitation', { p_token: token })
    setPending(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitacion no valida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Callout tone="critical">
            Este enlace no es valido, ya se uso o vencio.
          </Callout>
          <p className="text-xs text-muted-foreground">
            Pida a quien le invito que genere uno nuevo.
          </p>
        </CardContent>
      </Card>
    )
  }

  const emailMatches =
    sessionEmail !== null && sessionEmail.toLowerCase() === preview.email.toLowerCase()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitacion a {preview.organization_name}</CardTitle>
        <CardDescription>
          Rol: {ROLE_LABEL[preview.role]} · para {preview.email}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {sessionEmail === null ? (
          <>
            <p className="text-sm">
              Cree su cuenta con <strong>{preview.email}</strong> y vuelva a este enlace
              para entrar a la organizacion.
            </p>
            <div className="flex gap-2">
              <Link href={`/signup?invite=${token}`} className="flex-1">
                <Button className="w-full">Crear cuenta</Button>
              </Link>
              <Link href={`/login?next=/invite/${token}`} className="flex-1">
                <Button variant="secondary" className="w-full">
                  Ya tengo cuenta
                </Button>
              </Link>
            </div>
          </>
        ) : emailMatches ? (
          <>
            <p className="text-sm">
              Va a unirse como <strong>{ROLE_LABEL[preview.role]}</strong>.
            </p>
            <FormError>{error}</FormError>
            <Button onClick={accept} className="w-full" disabled={pending}>
              {pending ? 'Uniendose…' : 'Aceptar invitacion'}
            </Button>
          </>
        ) : (
          // El correo debe coincidir: es lo que impide que un enlace reenviado o
          // interceptado sirva de acceso universal a la organizacion.
          <Callout tone="warning" title="Esta invitacion es para otra cuenta">
            Inicio sesion como <strong>{sessionEmail}</strong>, pero la invitacion es para{' '}
            <strong>{preview.email}</strong>. Cierre sesion y entre con esa cuenta, o pida
            una invitacion a su propio correo.
          </Callout>
        )}
      </CardContent>
    </Card>
  )
}
