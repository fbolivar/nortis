'use client'

import { useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
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
import { decryptToFile, unwrapWithCredential } from '../services/crypto'
import { formatBytes } from '@/features/telemetry/components/event-row'
import { formatDateTime } from '@/lib/utils'

const SHARED_BUCKET = 'shared-packages'

/**
 * Descarga de un paquete por un destinatario SIN cuenta.
 *
 * Todo el descifrado ocurre aqui, en el navegador de quien recibe. La credencial
 * no se envia a ningun servidor: se usa para derivar localmente la clave que
 * desenvuelve la clave de datos. Nortis no puede leer este documento aunque
 * quisiera — y ese es precisamente el argumento comercial frente a mandar un
 * ZIP con contraseña por correo.
 */
export function ShareClaim({ token }: { token: string }) {
  const [credential, setCredential] = useState('')
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ filename: string; size: number }>()
  const [meta, setMeta] = useState<{ expiresAt: string | null; remaining: number | null }>()

  async function claim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    if (credential.trim().length < 8) {
      setError('Introduzca la credencial completa que le entregaron')
      return
    }

    setStatus('Validando enlace…')

    try {
      const supabase = createClient()

      // El RPC comprueba vencimiento, revocacion y cupo de descargas antes de
      // entregar la clave envuelta. Sin ella el ciphertext es indescifrable, asi
      // que revocar un envio lo inutiliza de verdad y no solo de cara a la UI.
      const { data, error: rpcError } = await supabase.rpc('open_shared_package', {
        p_token: token,
      })
      if (rpcError) throw new Error('El enlace no es valido o ya vencio')

      const pkg = Array.isArray(data) ? data[0] : data
      if (!pkg?.wrapped_key || !pkg.storage_path) {
        throw new Error('El enlace no es valido o ya vencio')
      }

      setMeta({ expiresAt: pkg.expires_at, remaining: pkg.downloads_remaining })

      setStatus('Derivando la clave con su credencial…')
      const dataKey = await unwrapWithCredential(
        pkg.wrapped_key,
        pkg.wrap_salt as string,
        credential.trim()
      )

      setStatus('Descargando el archivo cifrado…')
      const { data: blob, error: downloadError } = await supabase.storage
        .from(SHARED_BUCKET)
        .download(pkg.storage_path)
      if (downloadError) throw new Error('No se pudo descargar el contenido')

      setStatus('Descifrando en su equipo…')
      const result = await decryptToFile(new Uint8Array(await blob.arrayBuffer()), dataKey)

      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)

      setDone({ filename: result.filename, size: result.blob.size })
      setStatus(undefined)
    } catch (e) {
      setStatus(undefined)
      setError(e instanceof Error ? e.message : 'No se pudo abrir el paquete')
    }
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
            Documento descifrado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            <span className="font-mono">{done.filename}</span> ({formatBytes(done.size)}) se
            descargo en su equipo.
          </p>
          {meta?.remaining !== null && meta?.remaining !== undefined ? (
            <p className="text-xs text-muted-foreground">
              Quedan {meta.remaining} descargas de este enlace.
            </p>
          ) : null}
          <Callout tone="neutral">
            El descifrado ocurrio en su navegador. Ni Nortis ni el remitente pueden saber
            que hizo con el archivo a partir de aqui — guardelo con el mismo cuidado que el
            original.
          </Callout>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documento cifrado</CardTitle>
        <CardDescription>
          Introduzca la credencial que le entregaron por separado
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={claim} className="space-y-3">
          <div>
            <Label htmlFor="credential">Credencial de un solo uso</Label>
            <Input
              id="credential"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              className="font-mono"
              autoComplete="off"
              autoFocus
              required
            />
          </div>

          <FormError>{error}</FormError>

          {status ? <p className="text-xs text-info">{status}</p> : null}

          <Button type="submit" className="w-full" disabled={Boolean(status)}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {status ? 'Procesando…' : 'Descargar y descifrar'}
          </Button>

          {meta?.expiresAt ? (
            <p className="text-xs text-muted-foreground">
              El enlace vence el {formatDateTime(meta.expiresAt)}.
            </p>
          ) : null}
        </form>

        <p className="mt-4 text-xs text-muted-foreground">
          La credencial no se envia a ningun servidor: se usa en su propio navegador para
          descifrar. Si la introduce mal, el archivo simplemente no se abrira.
        </p>
      </CardContent>
    </Card>
  )
}
