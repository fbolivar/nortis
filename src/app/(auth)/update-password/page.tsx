import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui'
import { UpdatePasswordForm } from '@/features/auth/components/update-password-form'

export const metadata = {
  title: 'Nueva contraseña',
  robots: { index: false, follow: false },
}

/**
 * Solo se llega aqui con sesion, que es lo que deja /auth/confirm al canjear el
 * enlace del correo.
 *
 * La comprobacion se repite aunque el middleware ya exija sesion para esta ruta:
 * el middleware protege el ACCESO, pero quien llega con un enlace caducado
 * llegaria hasta el formulario, escribiria una contraseña y solo entonces
 * recibiria el fallo. Devolverlo antes al inicio con un motivo es mas honesto
 * que dejarle rellenar algo que ya no puede funcionar.
 */
export default async function UpdatePasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?recuperacion=invalida')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva contraseña</CardTitle>
        <CardDescription>{user.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  )
}
