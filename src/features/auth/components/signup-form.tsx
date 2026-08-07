'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { signUpSchema } from '../types/schemas'
import { Button, Input, Label, FormError, Callout } from '@/shared/components/ui'

/**
 * Registro publico. Crea SIEMPRE una organizacion nueva.
 *
 * Ya no existe la variante "me registro porque me invitaron": a los miembros de
 * un tenant existente los da de alta un administrador desde
 * /settings/users, con contraseña incluida. Esta pantalla es solo la puerta de
 * entrada de un cliente nuevo.
 */
export function SignUpForm() {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    const form = new FormData(event.currentTarget)
    const parsed = signUpSchema.safeParse({
      email: form.get('email'),
      fullName: form.get('fullName'),
      password: form.get('password'),
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.fullName } },
    })
    setPending(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    // Si el proyecto exige confirmacion de correo no hay sesion todavia y el
    // tenant aun no existe: se crea en /onboarding, tras el primer login.
    if (!data.session) {
      setNeedsConfirmation(true)
      return
    }

    router.replace('/onboarding')
    router.refresh()
  }

  if (needsConfirmation) {
    return (
      <Callout tone="info" title="Confirme su correo">
        Le enviamos un enlace de verificacion. Al confirmarlo podra iniciar sesion y
        registrar su organizacion.
      </Callout>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required autoFocus />
      </div>

      <div>
        <Label htmlFor="email">Correo corporativo</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div>
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Minimo 12 caracteres, con mayuscula, minuscula y numero.
        </p>
      </div>

      <FormError>{error}</FormError>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creando cuenta…' : 'Continuar'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ¿Ya tiene cuenta?{' '}
        <Link href="/login" className="text-foreground underline underline-offset-2">
          Iniciar sesion
        </Link>
      </p>
    </form>
  )
}
