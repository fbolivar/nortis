'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, UploadCloud } from 'lucide-react'
import { Button, Callout, Input, Label } from '@/shared/components/ui'

/**
 * Formulario para publicar una version del agente.
 *
 * El MSI ya debe estar en el bucket agent-dist (lo sube operaciones). Aqui solo
 * se indica su nombre y el numero de version; el servidor calcula el sha256 del
 * binario real y firma la URL. Publicar marca esa version como la actual y la
 * flota se actualiza sola.
 */
export function PublishReleaseForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [ok, setOk] = useState<string>()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setOk(undefined)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const res = await fetch('/api/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: form.get('version'),
        object_name: form.get('object_name'),
        notes: form.get('notes') || undefined,
      }),
    })
    setPending(false)

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? `No se pudo publicar (${res.status})`)
      return
    }
    setOk(`Version ${data.version} publicada. sha256 ${String(data.sha256).slice(0, 12)}… La flota se actualizara en su proximo ciclo.`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="version">Version (N.N.N)</Label>
          <Input id="version" name="version" placeholder="1.1.0" required pattern="\d+\.\d+\.\d+" />
        </div>
        <div>
          <Label htmlFor="object_name">Archivo en agent-dist</Label>
          <Input id="object_name" name="object_name" defaultValue="NortisAgent.msi" required />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Input id="notes" name="notes" placeholder="Popup en dominios bloqueados; borrado fuera de carpeta" />
      </div>

      {error ? <Callout tone="critical">{error}</Callout> : null}
      {ok ? <Callout tone="success">{ok}</Callout> : null}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
        {pending ? 'Publicando…' : 'Publicar como version actual'}
      </Button>
    </form>
  )
}
