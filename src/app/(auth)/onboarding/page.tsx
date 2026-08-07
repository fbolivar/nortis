import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui'
import { OnboardingForm } from '@/features/auth/components/onboarding-form'
import { getSessionContext } from '@/features/auth/services/session'

export default async function OnboardingPage() {
  const session = await getSessionContext()

  if (!session) redirect('/login')
  // Ya pertenece a una organizacion: bootstrap_organization fallaria, asi que se
  // evita mostrar un formulario condenado a error.
  if (session.profile) redirect('/dashboard')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Su organizacion</CardTitle>
        <CardDescription>
          Ultimo paso antes de desplegar agentes en sus equipos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingForm />
      </CardContent>
    </Card>
  )
}
