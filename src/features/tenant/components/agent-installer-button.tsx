'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui'

/**
 * Boton que descarga el paquete de instalacion del agente.
 *
 * La descarga es un POST, no un enlace: cada una genera una credencial de
 * enrolamiento nueva en el servidor, asi que no puede ser un GET que el navegador
 * precargue o cachee. Se pide con fetch, se recibe el ZIP como blob y se dispara
 * la descarga desde el cliente.
 */
export function AgentInstallerButton({
  size = 'sm',
  variant = 'secondary',
}: {
  size?: 'sm' | 'md'
  variant?: 'primary' | 'secondary'
}) {
  const [estado, setEstado] = useState<'idle' | 'cargando'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function descargar() {
    setEstado('cargando')
    setError(null)
    try {
      const res = await fetch('/api/installer', { method: 'POST' })
      if (!res.ok) {
        // El servidor responde JSON con { error } en los casos previstos
        // (instalador sin publicar, sin permiso). Se muestra ese texto tal cual.
        let mensaje = `No se pudo generar el instalador (${res.status})`
        try {
          const cuerpo = await res.json()
          if (cuerpo?.error) mensaje = cuerpo.error
        } catch {
          // respuesta sin cuerpo JSON: se queda el mensaje generico
        }
        setError(mensaje)
        setEstado('idle')
        return
      }

      const blob = await res.blob()
      const nombre =
        res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        'nortis-agent.zip'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setEstado('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red al descargar el instalador')
      setEstado('idle')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size={size} variant={variant} onClick={descargar} disabled={estado === 'cargando'}>
        {estado === 'cargando' ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        {estado === 'cargando' ? 'Preparando…' : 'Descargar instalador'}
      </Button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
