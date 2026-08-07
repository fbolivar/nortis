import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  InvitationAccept,
  type InvitationPreview,
} from '@/features/tenant/components/invitation-accept'

export const metadata: Metadata = {
  title: 'Invitacion — Nortis',
  // Un enlace de invitacion jamas debe acabar indexado.
  robots: { index: false, follow: false },
}

/**
 * Aceptacion de una invitacion. Vive en el grupo (auth) y en las rutas publicas
 * del proxy porque quien llega todavia puede no tener cuenta.
 *
 * La vista previa se resuelve aqui, en el servidor: el RPC es invocable por
 * `anon` y solo devuelve el nombre de la organizacion, el correo invitado y el
 * rol. Nada del listado de miembros ni de los datos del tenant.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const [{ data, error }, { data: userData }] = await Promise.all([
    supabase.rpc('preview_invitation', { p_token: token }),
    supabase.auth.getUser(),
  ])

  const row = Array.isArray(data) ? data[0] : data
  const preview = error || !row ? null : (row as InvitationPreview)

  return (
    <InvitationAccept
      token={token}
      preview={preview}
      sessionEmail={userData.user?.email ?? null}
    />
  )
}
