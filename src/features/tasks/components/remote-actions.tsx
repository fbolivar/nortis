'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Camera, Clock, Lock, MessageSquare, Power, ShieldCheck, Trash2 } from 'lucide-react'
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
  issueScan,
  issueScheduleScript,
  issueScreenshot,
  issueWake,
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
  targetMac,
  relays = [],
}: {
  endpointId: string
  hostname: string
  consentSigned?: boolean
  /** MAC de ESTE equipo, para Wake-on-LAN desde un relay. */
  targetMac?: string
  /** Otros equipos que pueden enviar el WOL (en linea, misma red). */
  relays?: { id: string; hostname: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string>()
  const [error, setError] = useState<string>()
  const [confirm, setConfirm] = useState('')
  const [avisoTitulo, setAvisoTitulo] = useState('')
  const [avisoCuerpo, setAvisoCuerpo] = useState('')
  const [proceso, setProceso] = useState('')
  const [relay, setRelay] = useState(relays[0]?.id ?? '')
  const [schedId, setSchedId] = useState('')
  const [schedScript, setSchedScript] = useState('')
  const [schedEvery, setSchedEvery] = useState('60')
  const [schedInterp, setSchedInterp] = useState<'powershell' | 'cmd'>('powershell')

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

        {/* Antivirus: escaneo bajo demanda (Windows Defender). */}
        <div className="space-y-2">
          <Label>Antivirus (Windows Defender)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                run(() => issueScan({ endpointIds: [endpointId], type: 'quick' }), 'Escaneo rapido iniciado.')
              }
              disabled={pending}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
              Escaneo rapido
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                run(() => issueScan({ endpointIds: [endpointId], type: 'full' }), 'Escaneo completo iniciado.')
              }
              disabled={pending}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
              Escaneo completo
            </Button>
            <span className="text-xs text-muted-foreground">
              El resultado (fecha y amenazas) aparece en el inventario tras completarse.
            </span>
          </div>
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

        {/* Wake-on-LAN: se envia a OTRO equipo de la misma red que despierta a este. */}
        {targetMac ? (
          <div className="space-y-2">
            <Label>Encender por Wake-on-LAN</Label>
            <p className="text-xs text-muted-foreground">
              Este equipo esta apagado o suspendido. Otro equipo encendido de la misma red le
              enviara la señal de arranque (MAC {targetMac}).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={relay}
                onChange={(e) => setRelay(e.target.value)}
                className="rounded-xl border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary"
              >
                {relays.length === 0 ? (
                  <option value="">Sin equipos disponibles para enviar</option>
                ) : (
                  relays.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.hostname}
                    </option>
                  ))
                )}
              </select>
              <Button
                variant="secondary"
                onClick={() =>
                  run(
                    () => issueWake({ endpointIds: [relay], mac: targetMac }),
                    'Señal de arranque enviada al equipo emisor.'
                  )
                }
                disabled={pending || !relay}
              >
                <Power className="mr-1.5 h-4 w-4" aria-hidden />
                Encender
              </Button>
            </div>
          </div>
        ) : null}

        {/* Script recurrente: se ejecuta cada N minutos en el equipo. */}
        <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" aria-hidden />
            Tarea programada (script recurrente)
          </div>
          <p className="text-xs text-muted-foreground">
            Se ejecuta cada N minutos hasta que la quites (intervalo 0 = eliminar). Util para
            mantenimiento, sincronizaciones o limpiezas periodicas.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="sch-id">Identificador</Label>
              <Input
                id="sch-id"
                value={schedId}
                onChange={(e) => setSchedId(e.target.value)}
                placeholder="limpieza-temp"
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="sch-every">Cada (minutos)</Label>
              <Input
                id="sch-every"
                type="number"
                min={0}
                value={schedEvery}
                onChange={(e) => setSchedEvery(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="sch-interp">Interprete</Label>
            <select
              id="sch-interp"
              value={schedInterp}
              onChange={(e) => setSchedInterp(e.target.value as 'powershell' | 'cmd')}
              className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary"
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD</option>
            </select>
          </div>
          <div>
            <Label htmlFor="sch-script">Script</Label>
            <textarea
              id="sch-script"
              value={schedScript}
              onChange={(e) => setSchedScript(e.target.value)}
              rows={3}
              placeholder="Remove-Item $env:TEMP\* -Recurse -Force -ErrorAction SilentlyContinue"
              className="w-full rounded-xl border border-border bg-input px-4 py-3 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              run(
                () =>
                  issueScheduleScript({
                    endpointIds: [endpointId],
                    id: schedId.trim(),
                    interpreter: schedInterp,
                    script: schedScript,
                    everyMinutes: Number(schedEvery) || 0,
                  }),
                Number(schedEvery) > 0 ? 'Tarea programada enviada.' : 'Tarea eliminada.'
              )
            }
            disabled={
              pending ||
              schedId.trim() === '' ||
              (Number(schedEvery) > 0 && schedScript.trim() === '')
            }
          >
            <Clock className="mr-1.5 h-4 w-4" aria-hidden />
            {Number(schedEvery) > 0 ? 'Programar' : 'Eliminar tarea'}
          </Button>
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
