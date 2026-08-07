'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { updatePasswordSchema } from '../types/schemas'
import { Button, Callout, FormError, Input, Label } from '@/shared/components/ui'

/**
 * Establece la contraseña nueva tras seguir el enlace de recuperacion.
 *
 * Llega aqui con sesion viva: /auth/confirm ya canjeo el enlace. Por eso basta
 * con `auth.updateUser` y no hace falta reenviar ningun token — el token del
 * correo ya se gasto, que es justo lo que se quiere de un enlace de un solo uso.
 *
 * NO REDIRIGE SOLO AL PANEL. Tras cambiar la contraseña la sesion sigue viva y
 * llevar directamente al panel pareceria lo comodo, pero quien acaba de
 * recuperar el acceso suele estar en un dispositivo prestado o distinto del
 * habitual. Se le confirma el cambio y se le deja decidir.
 */
export function UpdatePasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)

    const parsed = updatePasswordSchema.safeParse({ password, confirm })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    })
    setPending(false)

    if (updateError) {
      // El caso frecuente es el enlace caducado o ya usado: la sesion que abrio
      // /auth/confirm no llego a establecerse y updateUser se queda sin usuario.
      setError(
        updateError.message.toLowerCase().includes('session')
          ? 'El enlace ya no es valido. Solicite uno nuevo.'
          : updateError.message
      )
      return
    }

    setPassword('')
    setConfirm('')
    setDone(true)
    router.refresh()
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Callout tone="success" title="Contraseña actualizada">
          Ya puede entrar con la contraseña nueva. Si su cuenta es de
          administrador, se le pedira ademas el codigo de su aplicacion de
          autenticacion.
        </Callout>
        <Link href="/dashboard">
          <Button className="w-full">Ir a la consola</Button>
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="password">Contraseña nueva</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Minimo 12 caracteres, con minuscula, mayuscula y numero.
        </p>
      </div>

      <div>
        <Label htmlFor="confirm">Repita la contraseña</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <FormError>{error}</FormError>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Guardando…' : 'Establecer contraseña'}
      </Button>
    </form>
  )
}
