import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui'
import { SignUpForm } from '@/features/auth/components/signup-form'

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar organizacion</CardTitle>
        <CardDescription>
          Usted sera el propietario de la cuenta y podra invitar a su equipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
    </Card>
  )
}
