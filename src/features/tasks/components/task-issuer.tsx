'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/shared/components/ui'
import {
  issueInstallMsi,
  issuePushFile,
  issueRestart,
  type IssueResult,
} from '@/features/tasks/services/tasks'

type Endpoint = {
  id: string
  hostname: string | null
  last_logged_user: string | null
  status: string | null
}

type Kind = 'install_msi' | 'push_file' | 'restart'

const KINDS: { id: Kind; label: string; help: string }[] = [
  { id: 'install_msi', label: 'Instalar MSI', help: 'Descarga e instala un MSI en silencio.' },
  { id: 'push_file', label: 'Colocar archivo', help: 'Descarga un archivo y lo coloca en una ruta.' },
  { id: 'restart', label: 'Reiniciar', help: 'Reinicia el equipo con 60 s de aviso.' },
]

export function TaskIssuer({
  endpoints,
  canIssue,
  signingReady,
}: {
  endpoints: Endpoint[]
  canIssue: boolean
  signingReady: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<Kind>('install_msi')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [url, setUrl] = useState('')
  const [sha256, setSha256] = useState('')
  const [args, setArgs] = useState('')
  const [destPath, setDestPath] = useState('')
  const [result, setResult] = useState<IssueResult | null>(null)

  const allSelected = endpoints.length > 0 && selected.size === endpoints.length

  const hostnameById = useMemo(
    () => new Map(endpoints.map((e) => [e.id, e.hostname ?? 'equipo'])),
    [endpoints],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(endpoints.map((e) => e.id)))
  }

  function submit() {
    setResult(null)
    const endpointIds = [...selected]
    startTransition(async () => {
      let res: IssueResult
      if (kind === 'install_msi') res = await issueInstallMsi({ endpointIds, url, sha256, args })
      else if (kind === 'push_file') res = await issuePushFile({ endpointIds, url, sha256, destPath })
      else res = await issueRestart({ endpointIds })
      setResult(res)
      router.refresh()
    })
  }

  if (!canIssue) {
    return (
      <Callout tone="neutral">
        Su rol permite consultar el despliegue pero no emitir tareas. Se requiere owner o admin.
      </Callout>
    )
  }

  const disabled = pending || !signingReady || selected.size === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva tarea</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Accion */}
        <div>
          <Label>Accion</Label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  kind === k.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface text-foreground hover:bg-muted',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {KINDS.find((k) => k.id === kind)?.help}
          </p>
        </div>

        {/* Campos por accion */}
        {kind !== 'restart' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="url">URL del archivo (https)</Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/paquete.msi"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="sha256">sha256 del archivo</Label>
              <Input
                id="sha256"
                value={sha256}
                onChange={(e) => setSha256(e.target.value)}
                placeholder="64 caracteres hex"
                className="font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                En Windows:{' '}
                <code className="font-mono">certutil -hashfile paquete.msi SHA256</code>. El agente
                rechaza el archivo si el hash no coincide.
              </p>
            </div>
            {kind === 'install_msi' ? (
              <div className="sm:col-span-2">
                <Label htmlFor="args">Argumentos de msiexec (opcional)</Label>
                <Input
                  id="args"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="p. ej. /norestart ALLUSERS=1"
                />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <Label htmlFor="dest">Ruta destino en el equipo</Label>
                <Input
                  id="dest"
                  value={destPath}
                  onChange={(e) => setDestPath(e.target.value)}
                  placeholder="C:\\ProgramData\\Empresa\\config.xml"
                  className="font-mono"
                />
              </div>
            )}
          </div>
        ) : (
          <Callout tone="warning">
            El equipo se reiniciara con 60 segundos de aviso en pantalla. Asegurese de avisar al
            usuario.
          </Callout>
        )}

        {/* Equipos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="mb-0">Equipos ({selected.size} seleccionados)</Label>
            {endpoints.length > 0 ? (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allSelected ? 'Quitar todos' : 'Seleccionar todos'}
              </button>
            ) : null}
          </div>
          {endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay equipos con agente todavia.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {endpoints.map((e) => (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggle(e.id)}
                    className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.hostname ?? 'equipo'}</span>
                    {e.last_logged_user ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {e.last_logged_user}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={disabled}>
            {pending ? 'Encargando…' : `Encargar a ${selected.size} equipo(s)`}
          </Button>
          {!signingReady ? (
            <span className="text-xs text-muted-foreground">Configure AGENT_SIGNING_PRIVKEY para emitir.</span>
          ) : null}
        </div>

        {/* Resultado por equipo */}
        {result ? (
          <div className="space-y-1.5 rounded-xl border border-border bg-surface-muted p-3">
            {result.results.map((r) => (
              <p key={r.endpointId} className="text-sm">
                <span className="font-medium">{hostnameById.get(r.endpointId) ?? r.endpointId}</span>
                {r.taskId ? (
                  <span className="text-success"> · encargada</span>
                ) : (
                  <span className="text-critical"> · {r.error}</span>
                )}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
