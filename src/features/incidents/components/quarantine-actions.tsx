'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormError,
} from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'

/**
 * Un archivo que el agente retiro a cuarentena, con el estado del ultimo comando
 * que la consola le encargo sobre el (si hubo alguno). `command_kind` y
 * `command_status` vienen de agent_commands; son null si nunca se ordeno nada.
 */
export type QuarantinedFile = {
  quarantineId: string
  originalPath: string
  occurredAt: string
  commandKind: 'restore_file' | 'delete_quarantine' | null
  commandStatus: 'pending' | 'sent' | 'done' | 'failed' | null
  commandError: string | null
}

const COMMAND_STATUS_LABEL: Record<
  NonNullable<QuarantinedFile['commandStatus']>,
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'critical' }
> = {
  pending: { label: 'Encargado', tone: 'warning' },
  sent: { label: 'Enviado al equipo', tone: 'warning' },
  done: { label: 'Aplicado', tone: 'success' },
  failed: { label: 'Fallo', tone: 'critical' },
}

const KIND_LABEL: Record<NonNullable<QuarantinedFile['commandKind']>, string> = {
  restore_file: 'Restaurar',
  delete_quarantine: 'Borrar',
}

export function QuarantineActions({
  endpointId,
  files,
  canReview,
}: {
  endpointId: string
  files: QuarantinedFile[]
  canReview: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string>()

  async function order(
    file: QuarantinedFile,
    kind: 'restore_file' | 'delete_quarantine',
  ) {
    setError(undefined)
    setPending(`${file.quarantineId}:${kind}`)

    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc('create_quarantine_action', {
      p_endpoint_id: endpointId,
      p_kind: kind,
      p_quarantine_id: file.quarantineId,
      p_original_path: file.originalPath,
    })

    setPending(null)

    if (rpcError) {
      setError(rpcError.message)
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archivos en cuarentena</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          El agente los retiro de su ubicacion y los guarda en la carpeta protegida
          del equipo. Restaurar los devuelve a su ruta original; borrar los elimina
          de forma definitiva. La orden se aplica en el equipo en el proximo minuto.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {files.map((file) => {
          // Mientras haya un comando sin terminar (encargado o enviado) no se
          // ofrece otro: se espera a que el equipo lo aplique y lo reporte.
          const enCurso =
            file.commandStatus === 'pending' || file.commandStatus === 'sent'
          const status = file.commandStatus
            ? COMMAND_STATUS_LABEL[file.commandStatus]
            : null

          return (
            <div
              key={file.quarantineId}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="forensic break-all text-sm">{file.originalPath}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    Retirado {formatDateTime(file.occurredAt)}
                  </p>
                </div>
                {status ? (
                  <Badge tone={status.tone}>
                    {file.commandKind ? `${KIND_LABEL[file.commandKind]}: ` : ''}
                    {status.label}
                  </Badge>
                ) : null}
              </div>

              {file.commandStatus === 'failed' && file.commandError ? (
                <p className="forensic mt-2 break-all text-xs text-critical">
                  {file.commandError}
                </p>
              ) : null}

              {canReview ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => order(file, 'restore_file')}
                    disabled={enCurso || pending !== null}
                  >
                    {pending === `${file.quarantineId}:restore_file`
                      ? 'Encargando…'
                      : 'Restaurar a su ruta'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => order(file, 'delete_quarantine')}
                    disabled={enCurso || pending !== null}
                  >
                    {pending === `${file.quarantineId}:delete_quarantine`
                      ? 'Encargando…'
                      : 'Borrar definitivamente'}
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}

        <FormError>{error}</FormError>

        {!canReview ? (
          <Callout tone="neutral">
            Su rol permite consultar la cuarentena pero no restaurar ni borrar
            archivos.
          </Callout>
        ) : null}
      </CardContent>
    </Card>
  )
}
