'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormError,
  Input,
  Label,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { formatDateTime, formatRelative } from '@/lib/utils'
import type { ApiKey } from '@/shared/types/database'

export function ApiKeysManager({ apiKeys, canManage }: { apiKeys: ApiKey[]; canManage: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [revoking, setRevoking] = useState<string>()
  // Texto plano de la clave recien creada. Solo vive en el estado de este
  // componente: no se guarda en ningun sitio y desaparece al recargar.
  const [freshKey, setFreshKey] = useState<string>()
  const [copied, setCopied] = useState(false)

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    if (name.trim().length < 2) {
      setError('Indique un nombre que identifique donde se usara la credencial')
      return
    }

    setPending(true)
    const supabase = createClient()

    // La clave se genera DENTRO de Postgres (RPC create_api_key). El texto plano
    // llega una sola vez en esta respuesta y jamas se persiste: la tabla guarda
    // solo su SHA-256.
    const { data, error: rpcError } = await supabase.rpc('create_api_key', {
      p_name: name.trim(),
    })
    setPending(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    const created = Array.isArray(data) ? data[0] : data
    if (created?.api_key) {
      setFreshKey(created.api_key)
      setName('')
      router.refresh()
    }
  }

  async function revoke(id: string) {
    setError(undefined)
    setPending(true)
    const supabase = createClient()

    const { data: userData } = await supabase.auth.getUser()
    const { error: updateError } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString(), revoked_by: userData.user?.id ?? null })
      .eq('id', id)

    setPending(false)
    setRevoking(undefined)

    if (updateError) {
      setError(updateError.message)
      return
    }
    router.refresh()
  }

  async function copyKey() {
    if (!freshKey) return
    await navigator.clipboard.writeText(freshKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const active = apiKeys.filter((k) => !k.revoked_at)

  return (
    <div className="space-y-5">
      {freshKey ? (
        <Callout tone="warning" title="Copie la credencial ahora">
          <p className="mb-2">
            Es la <strong>unica vez</strong> que se muestra. Nortis guarda solo su hash,
            asi que no podemos volver a mostrarsela: si la pierde, tendra que revocarla y
            generar otra.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-xl border border-border bg-surface-muted px-3 py-2 font-mono text-xs">
              {freshKey}
            </code>
            <Button size="sm" variant="secondary" onClick={copyKey}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiada' : 'Copiar'}
            </Button>
          </div>
          <button
            onClick={() => setFreshKey(undefined)}
            className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ya la guarde, ocultar
          </button>
        </Callout>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Generar credencial</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createKey} className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="keyName">Nombre</Label>
                <Input
                  id="keyName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agentes sede Bogota"
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? 'Generando…' : 'Generar'}
              </Button>
            </form>
            <FormError>{error}</FormError>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Credenciales ({active.length} activas)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {apiKeys.length === 0 ? (
            <EmptyState
              title="Sin credenciales de agente"
              description="Cada credencial autentica a los agentes de un grupo de equipos. Genere una por sede o por lote de despliegue: si una se compromete, revocarla no deja fuera a toda la organizacion."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Prefijo</Th>
                  <Th>Estado</Th>
                  <Th>Ultimo uso</Th>
                  <Th>Creada</Th>
                  {canManage ? <Th /> : null}
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => {
                  const revoked = Boolean(key.revoked_at)
                  const expired =
                    !revoked && key.expires_at ? new Date(key.expires_at) < new Date() : false

                  return (
                    <tr key={key.id} className="hover:bg-surface-muted">
                      <Td>{key.name}</Td>
                      <Td className="font-mono text-xs text-muted-foreground">
                        {key.key_prefix}…
                      </Td>
                      <Td>
                        {revoked ? (
                          <Badge tone="critical">Revocada</Badge>
                        ) : expired ? (
                          <Badge tone="warning">Vencida</Badge>
                        ) : (
                          <Badge tone="success">Activa</Badge>
                        )}
                      </Td>
                      <Td className="text-muted-foreground">
                        {key.last_used_at ? formatRelative(key.last_used_at) : 'nunca'}
                      </Td>
                      <Td className="text-muted-foreground tabular-nums">
                        {formatDateTime(key.created_at)}
                      </Td>
                      {canManage ? (
                        <Td className="text-right">
                          {revoked ? null : revoking === key.id ? (
                            <span className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => revoke(key.id)}
                                disabled={pending}
                              >
                                Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRevoking(undefined)}
                              >
                                Cancelar
                              </Button>
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setRevoking(key.id)}
                            >
                              Revocar
                            </Button>
                          )}
                        </Td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Revocar es definitivo: una credencial revocada no se puede reactivar, y los
        agentes que la usen dejaran de reportar de inmediato. Las credenciales no se
        borran nunca — conservarlas es lo que permite saber que agente reporto que.
      </p>
    </div>
  )
}
