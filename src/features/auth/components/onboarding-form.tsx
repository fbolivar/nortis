'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { organizationSchema } from '../types/schemas'
import { Button, Input, Label, FormError } from '@/shared/components/ui'

/**
 * Marcas diacriticas combinantes que produce normalize('NFD').
 * Se declara con escapes explicitos en vez de escribir el rango literal: los
 * caracteres combinantes son invisibles en el codigo fuente y se pierden al
 * copiar o reformatear el archivo.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Sugerencia de slug a partir del nombre; el usuario puede corregirla. */
function toSlug(value: string) {
  return value
    .toLowerCase()
    // NFD descompone "í" en "i" + tilde combinante. Hay que ELIMINAR la marca
    // antes del filtro alfanumerico: si se deja, [^a-z0-9] la convierte en
    // guion y "logistica" sale como "logi-stica".
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 62)
}

export function OnboardingForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    const parsed = organizationSchema.safeParse({ name, slug: slug || toSlug(name) })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    const supabase = createClient()

    // bootstrap_organization crea la organizacion y la fila de usuario como
    // owner en una sola transaccion. No se hacen dos inserts desde el cliente:
    // si el segundo fallara quedaria una organizacion huerfana sin dueño, y
    // nadie podria administrarla ni borrarla.
    const { error: rpcError } = await supabase.rpc('bootstrap_organization', {
      p_org_name: parsed.data.name,
      p_org_slug: parsed.data.slug,
    })
    setPending(false)

    if (rpcError) {
      setError(
        rpcError.message.includes('duplicate') || rpcError.message.includes('unique')
          ? 'Ese identificador ya esta en uso'
          : rpcError.message
      )
      return
    }

    router.replace('/mfa')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Nombre de la organizacion</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugTouched) setSlug(toSlug(e.target.value))
          }}
          placeholder="Distribuidora del Caribe SAS"
          required
          autoFocus
        />
      </div>

      <div>
        <Label htmlFor="slug">Identificador</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          className="font-mono"
          placeholder="distribuidora-caribe"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Identifica a su organizacion ante los agentes instalados. No se puede cambiar
          despues.
        </p>
      </div>

      <FormError>{error}</FormError>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creando…' : 'Crear organizacion'}
      </Button>
    </form>
  )
}
