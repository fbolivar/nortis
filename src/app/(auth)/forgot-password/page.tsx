import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui'
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form'

export const metadata = {
  title: 'Recuperar acceso',
  // Una pagina de recuperacion indexada es material de phishing servido por
  // buscador: aparece en los resultados y da apariencia de legitimidad a
  // cualquier copia.
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar acceso</CardTitle>
        <CardDescription>
          Le enviaremos un enlace para establecer una contraseña nueva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  )
}
