'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, CardContent, CardHeader, CardTitle, FormError } from '@/shared/components/ui'
import { StringListInput } from '@/features/policies/components/string-list-input'

/** 1-40 caracteres, normalizada a minusculas (igual que el RPC del servidor). */
function validateTag(raw: string) {
  const v = raw.trim().toLowerCase()
  return v.length >= 1 && v.length <= 40
    ? ({ ok: true, value: v } as const)
    : ({ ok: false, error: 'Etiqueta de 1 a 40 caracteres' } as const)
}

export function EndpointTags({
  endpointId,
  initial,
  canEdit,
}: {
  endpointId: string
  initial: string[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tags, setTags] = useState<string[]>(initial)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  function save() {
    setError(undefined)
    setSaved(false)
    start(async () => {
      const supabase = createClient()
      const { error: e } = await supabase.rpc('set_endpoint_tags', {
        p_endpoint_id: endpointId,
        p_tags: tags,
      })
      if (e) {
        setError(e.message)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Etiquetas</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Agrupa y filtra la flota (p. ej. contabilidad, gerencia). Se filtran desde la lista de
          equipos.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <StringListInput
          label="Etiquetas del equipo"
          placeholder="contabilidad"
          values={tags}
          onChange={setTags}
          validate={validateTag}
          disabled={!canEdit}
        />
        {saved ? <p className="text-sm text-success">Guardado.</p> : null}
        <FormError>{error}</FormError>
        {canEdit ? (
          <Button onClick={save} disabled={pending} size="sm">
            Guardar etiquetas
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
