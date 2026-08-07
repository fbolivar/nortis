'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { credentialsSchema } from '../types/schemas'
import { Button, Input, Label, FormError } from '@/shared/components/ui'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    const form = new FormData(event.currentTarget)
    const parsed = credentialsSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data)
    setPending(false)

    if (signInError) {
      // Mensaje deliberadamente generico: distinguir "correo no existe" de
      // "contraseña incorrecta" convierte el login en un oraculo para enumerar
      // que correos tienen cuenta en Nortis.
      setError('Credenciales invalidas')
      return
    }

    // El layout de la consola decide a donde va: onboarding si aun no tiene
    // organizacion, enrolamiento de MFA si le falta el segundo factor.
    router.replace(searchParams.get('next') ?? '/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Correo corporativo</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>

      <div>
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <FormError>{error}</FormError>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Verificando…' : 'Entrar'}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ¿No tiene cuenta?{' '}
        <Link href="/signup" className="text-foreground underline underline-offset-2">
          Registrar organizacion
        </Link>
      </p>
    </form>
  )
}
