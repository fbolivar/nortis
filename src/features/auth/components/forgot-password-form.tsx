'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { forgotPasswordSchema } from '../types/schemas'
import { Button, Callout, FormError, Input, Label } from '@/shared/components/ui'

/**
 * Solicitud de enlace de recuperacion.
 *
 * RESPONDE LO MISMO EXISTA O NO LA CUENTA. Es la misma regla que ya gobierna el
 * login ("Credenciales invalidas" sin decir cual falla): si esta pantalla
 * dijera "no hay ninguna cuenta con ese correo", cualquiera podria averiguar
 * que empresas son clientes de Nortis probando correos corporativos. Supabase
 * tampoco distingue en su respuesta, asi que ni siquiera hay que fingirlo.
 *
 * El coste es real y hay que asumirlo: alguien que se equivoque de correo se
 * queda esperando un mensaje que no llega. Por eso el texto dice explicitamente
 * "si existe una cuenta", en vez de prometer un envio.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)

    const parsed = forgotPasswordSchema.safeParse({ email })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    const supabase = createClient()

    // `redirectTo` se construye con el origen REAL del navegador y no con una
    // variable de entorno: en un despliegue de vista previa de Vercel el dominio
    // cambia en cada rama, y un enlace que apunta a produccion desde una vista
    // previa manda al usuario a cambiar la contraseña en el sitio equivocado.
    // El dominio debe estar en la lista de redirecciones permitidas de Supabase.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
    })
    setPending(false)

    // Solo se muestra un fallo cuando es del transporte (sin red, limite de
    // envio de Supabase). El "no existe esa cuenta" nunca llega hasta aqui.
    if (resetError) {
      setError('No se pudo enviar el correo. Intente de nuevo en unos minutos.')
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Callout tone="success" title="Revise su correo">
          Si existe una cuenta con <strong>{email}</strong>, le enviamos un enlace para
          establecer una contraseña nueva. Caduca en una hora y solo se puede usar una vez.
        </Callout>
        <p className="text-center text-xs text-muted-foreground">
          ¿No llego?{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-foreground underline underline-offset-2"
          >
            Intentar con otro correo
          </button>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Correo corporativo</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <FormError>{error}</FormError>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar enlace de recuperacion'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="text-foreground underline underline-offset-2">
          Volver a iniciar sesion
        </Link>
      </p>
    </form>
  )
}
