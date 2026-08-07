import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui'
import { SignUpForm } from '@/features/auth/components/signup-form'

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Registre su organizacion en Nortis. Sera el propietario de la consola y desde
          ahi podra dar de alta al resto de su equipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
    </Card>
  )
}
