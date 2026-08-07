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
  CardDescription,
  CardHeader,
  CardTitle,
  FormError,
  Input,
  Label,
} from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import type { Organization } from '@/shared/types/database'

/**
 * Registro y revocacion de la autorizacion de tratamiento de datos.
 *
 * Este panel es el interruptor legal de los modulos invasivos (titulos de
 * ventana y captura de pantalla). El bloqueo real lo impone un trigger en la
 * base: aunque alguien manipulara esta UI, no podria guardar un perfil con esos
 * modulos activos sin la fecha de firma registrada.
 */
export function ConsentPanel({
  organization,
  canEdit,
}: {
  organization: Organization
  canEdit: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)

  const signed = Boolean(organization.monitoring_consent_signed_at)

  async function grant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    const form = new FormData(event.currentTarget)
    const signedBy = String(form.get('signedBy') ?? '').trim()

    if (signedBy.length < 3) {
      setError('Indique nombre y cargo de quien firma')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        monitoring_consent_signed_at: new Date().toISOString(),
        monitoring_consent_signed_by: signedBy,
      })
      .eq('id', organization.id)
    setPending(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    router.refresh()
  }

  async function revoke() {
    setError(undefined)
    setPending(true)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        monitoring_consent_signed_at: null,
        monitoring_consent_signed_by: null,
      })
      .eq('id', organization.id)
    setPending(false)
    setConfirmingRevoke(false)

    if (updateError) {
      setError(updateError.message)
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Autorizacion de tratamiento de datos</CardTitle>
            <CardDescription>
              Ley 1581 de 2012 — requisito para monitoreo de titulos de ventana y captura
              de pantalla
            </CardDescription>
          </div>
          <Badge tone={signed ? 'success' : 'warning'}>
            {signed ? 'Registrada' : 'Pendiente'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {signed ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Fecha de registro</dt>
                <dd className="mt-0.5 text-sm tabular-nums">
                  {formatDateTime(organization.monitoring_consent_signed_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Firmado por</dt>
                <dd className="mt-0.5 text-sm">
                  {organization.monitoring_consent_signed_by}
                </dd>
              </div>
            </dl>

            {canEdit ? (
              confirmingRevoke ? (
                <Callout tone="critical" title="Revocar la autorizacion">
                  <p className="mb-3">
                    Los perfiles que tengan activos titulos de ventana o captura de
                    pantalla dejaran de poder guardarse hasta registrar una nueva
                    autorizacion. La revocacion queda asentada en el log de auditoria.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={revoke} disabled={pending}>
                      {pending ? 'Revocando…' : 'Confirmar revocacion'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingRevoke(false)}
                      disabled={pending}
                    >
                      Cancelar
                    </Button>
                  </div>
                </Callout>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmingRevoke(true)}>
                  Revocar autorizacion
                </Button>
              )
            ) : null}
          </>
        ) : (
          <>
            <Callout tone="warning">
              Sin este registro, Nortis <strong>bloquea</strong> los modulos de captura de
              pantalla y titulos de ventana. Registre la autorizacion solo cuando tenga
              el documento firmado por sus trabajadores: esta fecha es la evidencia de
              cumplimiento ante una auditoria de la SIC.
            </Callout>

            {canEdit ? (
              <form onSubmit={grant} className="space-y-3">
                <div>
                  <Label htmlFor="signedBy">Nombre y cargo de quien autoriza</Label>
                  <Input
                    id="signedBy"
                    name="signedBy"
                    placeholder="Maria Restrepo — Representante legal"
                    required
                  />
                </div>
                <FormError>{error}</FormError>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? 'Registrando…' : 'Registrar autorizacion'}
                </Button>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                Solo el propietario de la cuenta puede registrar esta autorizacion.
              </p>
            )}
          </>
        )}

        {signed ? <FormError>{error}</FormError> : null}
      </CardContent>
    </Card>
  )
}
