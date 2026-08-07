import { Suspense } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui'
import { SignUpForm } from '@/features/auth/components/signup-form'

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Si viene invitado, se unira a la organizacion que le invito; si no, sera el
          propietario de una nueva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* El formulario lee ?invite= con useSearchParams, que exige un limite de
            Suspense para no forzar el renderizado dinamico de toda la pagina. */}
        <Suspense fallback={null}>
          <SignUpForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
