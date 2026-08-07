import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui'
import { MfaSetup } from '@/features/auth/components/mfa-setup'
import { getSessionContext } from '@/features/auth/services/session'

export default async function MfaPage() {
  const session = await getSessionContext()

  if (!session) redirect('/login')
  if (!session.profile) redirect('/onboarding')
  // Ya cumple: no tiene sentido pedirle el codigo otra vez.
  if (session.mfaSatisfied && session.currentLevel === 'aal2') redirect('/dashboard')

  const alreadyEnrolled = session.nextLevel === 'aal2'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{alreadyEnrolled ? 'Verificacion en dos pasos' : 'Configurar segundo factor'}</CardTitle>
        <CardDescription>
          {alreadyEnrolled
            ? 'Introduzca el codigo de su aplicacion de autenticacion.'
            : 'Necesario para administrar politicas y credenciales de agentes.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaSetup enforced={session.mfaRequired} alreadyEnrolled={alreadyEnrolled} />
      </CardContent>
    </Card>
  )
}
