'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Camera, Lock, MessageSquare, Trash2 } from 'lucide-react'
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormError,
  Input,
  Label,
} from '@/shared/components/ui'
import {
  issueKill,
  issueLock,
  issueMessage,
  issueScreenshot,
  issueWipe,
} from '@/features/tasks/services/tasks'

/**
 * Acciones remotas de emergencia para un equipo perdido o robado. Van por el
 * canal de tareas FIRMADAS (Ed25519, admin + MFA), igual que el resto de la
 * ejecucion remota. El bloqueo es reversible; el borrado NO, y por eso exige
 * teclear una confirmacion antes de habilitarse.
 */
export function RemoteActions({
  endpointId,
  hostname,
  consentSigned = false,
}: {
  endpointId: string
  hostname: string
  consentSigned?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string>()
  const [error, setError] = useState<string>()
  const [confirm, setConfirm] = useState('')
  const [avisoTitulo, setAvisoTitulo] = useState('')
  const [avisoCuerpo, setAvisoCuerpo] = useState('')
  const [proceso, setProceso] = useState('')

  /** Envuelve una server action de una sola-tarea y refleja su resultado. */
  function run(fn: () => Promise<{ results: { error?: string }[] }>, okMsg: string) {
    setError(undefined)
    setMsg(undefined)
    start(async () => {
      const r = await fn()
      const res = r.results[0]
      if (res?.error) {
        setError(res.error)
      } else {
        setMsg(okMsg)
        router.refresh()
      }
    })
  }

  function lock() {
    setError(undefined)
    setMsg(undefined)
    if (!window.confirm(`Bloquear ${hostname} ahora? El usuario tendra que volver a iniciar sesion.`)) {
      return
    }
    start(async () => {
      const r = await issueLock({ endpointIds: [endpointId] })
      const res = r.results[0]
      if (res?.error) {
        setError(res.error)
      } else {
        setMsg('Bloqueo enviado. Se aplica en el proximo sondeo del equipo (~1 min).')
        router.refresh()
      }
    })
  }

  function wipe() {
    setError(undefined)
    setMsg(undefined)
    start(async () => {
      const r = await issueWipe({ endpointIds: [endpointId], confirm })
      const res = r.results[0]
      if (res?.error) {
        setError(res.error)
      } else {
        setMsg('Borrado enviado. Se aplica en el proximo sondeo del equipo (~1 min).')
        setConfirm('')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acciones remotas</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Para un equipo perdido o robado. Se envian firmadas y se aplican en el proximo sondeo
          del equipo (~1 min); solo funcionan si el equipo se conecta.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={lock} disabled={pending}>
            <Lock className="mr-1.5 h-4 w-4" aria-hidden />
            Bloquear equipo
          </Button>
          <span className="text-xs text-muted-foreground">
            Cierra la sesion a la pantalla de inicio. Reversible: el usuario vuelve a entrar con su
            contrasena.
          </span>
        </div>

        {/* Captura de pantalla bajo demanda (requiere consentimiento). */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              run(() => issueScreenshot({ endpointIds: [endpointId] }), 'Captura solicitada.')
            }
            disabled={pending || !consentSigned}
          >
            <Camera className="mr-1.5 h-4 w-4" aria-hidden />
            Capturar pantalla ahora
          </Button>
          <span className="text-xs text-muted-foreground">
            {consentSigned
              ? 'Aparecera en la galeria del equipo en ~1 min.'
              : 'Requiere el consentimiento de monitoreo firmado (Administracion).'}
          </span>
        </div>

        {/* Aviso al usuario. */}
        <div className="space-y-2">
          <Label>Enviar un aviso al usuario</Label>
          <Input
            value={avisoTitulo}
            onChange={(e) => setAvisoTitulo(e.target.value)}
            placeholder="Titulo (opcional)"
          />
          <textarea
            value={avisoCuerpo}
            onChange={(e) => setAvisoCuerpo(e.target.value)}
            rows={2}
            placeholder="Mensaje que vera el usuario en su pantalla…"
            className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary"
          />
          <Button
            variant="secondary"
            onClick={() =>
              run(
                () =>
                  issueMessage({ endpointIds: [endpointId], title: avisoTitulo, body: avisoCuerpo }),
                'Aviso enviado.'
              )
            }
            disabled={pending || avisoCuerpo.trim() === ''}
          >
            <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden />
            Enviar aviso
          </Button>
        </div>

        {/* Cerrar un proceso por nombre. */}
        <div className="space-y-2">
          <Label>Cerrar un proceso</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={proceso}
              onChange={(e) => setProceso(e.target.value)}
              placeholder="anydesk.exe"
              className="max-w-[14rem] font-mono"
            />
            <Button
              variant="secondary"
              onClick={() =>
                run(
                  () => issueKill({ endpointIds: [endpointId], name: proceso.trim() }),
                  'Orden de cierre enviada.'
                )
              }
              disabled={pending || !/\.exe$/i.test(proceso.trim())}
            >
              <Ban className="mr-1.5 h-4 w-4" aria-hidden />
              Cerrar proceso
            </Button>
          </div>
        </div>

        {/* Zona peligrosa: borrado irreversible. */}
        <div className="rounded-xl border border-critical/40 bg-critical-subtle/40 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-critical">
            <Trash2 className="h-4 w-4" aria-hidden />
            Borrado remoto de datos
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Elimina el contenido de las carpetas de documentos del usuario (Escritorio, Documentos,
            Descargas, OneDrive) y de las unidades USB conectadas. <strong>Es irreversible</strong> y
            no toca el sistema operativo. Para confirmar, escriba <strong>BORRAR</strong>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="BORRAR"
              className="max-w-[10rem] font-mono"
              aria-label="Escriba BORRAR para confirmar"
            />
            <Button variant="danger" onClick={wipe} disabled={pending || confirm !== 'BORRAR'}>
              Borrar datos de {hostname}
            </Button>
          </div>
        </div>

        {msg ? (
          <Callout tone="success" title="Enviado">
            {msg}
          </Callout>
        ) : null}
        <FormError>{error}</FormError>
      </CardContent>
    </Card>
  )
}
