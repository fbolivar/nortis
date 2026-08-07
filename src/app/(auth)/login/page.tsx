import { Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui'
import { LoginForm } from '@/features/auth/components/login-form'

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesion</CardTitle>
      </CardHeader>
      <CardContent>
        {/* useSearchParams exige un limite de Suspense para no forzar el
            renderizado dinamico de toda la pagina. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
