'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { totpCodeSchema } from '../types/schemas'
import { Button, Input, Label, FormError, Callout } from '@/shared/components/ui'

/**
 * Enrolamiento y verificacion de segundo factor (TOTP).
 *
 * Resuelve el punto ciego del esquema: la base exige aal2 a owner/admin, con una
 * unica excepcion —leer su propia fila en `users`—. Sin esta pantalla, un
 * administrador nuevo entraria en aal1 y no veria nada de la consola, sin forma
 * de salir del bloqueo.
 *
 * El enrolamiento es una accion EXPLICITA del usuario, no un efecto al montar.
 * Dos razones: cada enroll() crea un factor 'unverified' en Supabase, asi que
 * hacerlo automaticamente llenaria la cuenta de factores fantasma de quien solo
 * abrio la pagina y se fue; y ademas evita el patron de setState en cascada
 * dentro de useEffect.
 *
 * `alreadyEnrolled` lo decide el servidor (nextLevel === 'aal2'), que ya lo sabe
 * al pintar la pagina: no hace falta una consulta extra desde el cliente.
 */
export function MfaSetup({
  enforced,
  alreadyEnrolled,
}: {
  enforced: boolean
  alreadyEnrolled: boolean
}) {
  const router = useRouter()
  const [factorId, setFactorId] = useState<string>()
  const [qrCode, setQrCode] = useState<string>()
  const [secret, setSecret] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function startEnrollment() {
    setError(undefined)
    setPending(true)

    const supabase = createClient()
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()

    if (listError) {
      setPending(false)
      setError(listError.message)
      return
    }

    // Enrolamientos previos sin terminar dejan factores 'unverified' que hacen
    // fallar el siguiente enroll por nombre duplicado. Se limpian primero.
    const stale = factors.all.filter(
      (f) => f.factor_type === 'totp' && f.status === 'unverified'
    )
    for (const f of stale) {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Nortis ${new Date().toISOString().slice(0, 19)}`,
    })
    setPending(false)

    if (enrollError) {
      setError(enrollError.message)
      return
    }

    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    const form = new FormData(event.currentTarget)
    const parsed = totpCodeSchema.safeParse({ code: String(form.get('code') ?? '').trim() })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    const supabase = createClient()

    // En el camino de solo-verificacion no hay factorId en estado: se resuelve
    // aqui, contra el factor ya verificado de la cuenta.
    let targetFactorId = factorId
    if (!targetFactorId) {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) {
        setPending(false)
        setError(listError.message)
        return
      }
      targetFactorId = factors.all.find(
        (f) => f.factor_type === 'totp' && f.status === 'verified'
      )?.id
    }

    if (!targetFactorId) {
      setPending(false)
      setError('No hay un segundo factor configurado en esta cuenta')
      return
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: targetFactorId,
    })

    if (challengeError) {
      setPending(false)
      setError(challengeError.message)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: targetFactorId,
      challengeId: challenge.id,
      code: parsed.data.code,
    })

    if (verifyError) {
      setPending(false)
      setError('Codigo incorrecto o vencido')
      return
    }

    // Espejo en public.users para la pagina de cumplimiento. No es la fuente de
    // verdad del control de acceso —eso es el claim aal del JWT— asi que si
    // falla no se interrumpe el flujo.
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      await supabase.from('users').update({ mfa_enabled: true }).eq('id', userData.user.id)
    }

    router.replace('/dashboard')
    router.refresh()
  }

  const showCodeForm = alreadyEnrolled || Boolean(qrCode)

  return (
    <div className="space-y-4">
      {enforced ? (
        <Callout tone="warning" title="Segundo factor obligatorio">
          Su rol administra politicas de seguridad y credenciales de agentes. Hasta
          completar este paso no podra ver datos de la organizacion.
        </Callout>
      ) : null}

      {!alreadyEnrolled && !qrCode ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Necesitara una aplicacion de autenticacion: Google Authenticator, 1Password
            o Microsoft Authenticator.
          </p>
          <FormError>{error}</FormError>
          <Button onClick={startEnrollment} className="w-full" disabled={pending}>
            {pending ? 'Generando…' : 'Generar codigo QR'}
          </Button>
        </div>
      ) : null}

      {qrCode ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Escanee el codigo con su aplicacion de autenticacion.
          </p>

          <div className="flex justify-center rounded-md border border-border bg-white p-3">
            {/*
              <img> y no next/image: qr_code es un data URI SVG en linea que
              genera Supabase. next/image lanza un error de runtime con SVG en
              data URI (exige dangerouslyAllowSVG), y aqui no hay nada que
              optimizar — el recurso ya viaja dentro del HTML.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="Codigo QR para configurar TOTP" width={180} height={180} />
          </div>

          {secret ? (
            <div>
              <Label>Clave manual</Label>
              <code className="block break-all rounded-md border border-border bg-surface-muted px-2 py-1.5 font-mono text-xs">
                {secret}
              </code>
            </div>
          ) : null}
        </div>
      ) : null}

      {showCodeForm ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="code">Codigo de 6 digitos</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center font-mono tracking-[0.4em]"
              required
              autoFocus={alreadyEnrolled}
            />
          </div>

          <FormError>{error}</FormError>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Verificando…' : alreadyEnrolled ? 'Verificar' : 'Activar segundo factor'}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
