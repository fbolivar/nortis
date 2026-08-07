'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormError,
  Input,
  Label,
} from '@/shared/components/ui'
import { changeOwnPasswordSchema } from '../types/schemas'

/**
 * Cambio de la contraseña propia.
 *
 * NO pasa por `admin_set_user_password`, que ademas la rechaza explicitamente
 * para la cuenta propia. Se usa `auth.updateUser()`, que es la via oficial de
 * GoTrue: exige una sesion viva, aplica la politica del proyecto y mantiene
 * coherente el estado interno del usuario. Encaminar el cambio propio por la RPC
 * de administracion saltaria todo eso sin ganar nada.
 *
 * A diferencia del cambio que hace un administrador sobre otra cuenta, aqui se
 * pide confirmacion: un error de tecleo deja a la persona fuera de su propia
 * cuenta, y Nortis todavia no envia correos de recuperacion.
 */
export function OwnPasswordCard({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    setDone(false)

    const parsed = changeOwnPasswordSchema.safeParse({ password, confirm })
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
      setError(updateError.message)
      return
    }

    setPassword('')
    setConfirm('')
    setDone(true)
    // No se llama a router.refresh(): la sesion actual sigue siendo valida tras
    // el cambio y no hay nada renderizado por el servidor que dependa de esto.
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mi contraseña</CardTitle>
        <CardDescription>{email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-sm space-y-4">
          <div>
            <Label htmlFor="own-password">Contraseña nueva</Label>
            <Input
              id="own-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Minimo 12 caracteres, con minuscula, mayuscula y numero.
            </p>
          </div>
          <div>
            <Label htmlFor="own-confirm">Repita la contraseña</Label>
            <Input
              id="own-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <FormError>{error}</FormError>

          {done ? (
            <Callout tone="success">
              Contraseña actualizada. Su sesion actual sigue abierta.
            </Callout>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
