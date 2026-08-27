'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
import { StringListInput } from '@/features/policies/components/string-list-input'
import { SEVERITY_LABEL } from '@/features/incidents/types/incidents'
import type { IncidentSeverity } from '@/shared/types/database'

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/

/** Valida un correo con la MISMA regla que el RPC del servidor. */
function validateEmail(raw: string) {
  const v = raw.trim().toLowerCase()
  return EMAIL_RE.test(v)
    ? ({ ok: true, value: v } as const)
    : ({ ok: false, error: 'Correo no valido' } as const)
}

/** Solo se ofrecen umbrales utiles: alta/critica es lo normal; media incluye mas
 *  ruido; critica sola para equipos que solo quieren lo mas grave. */
const SEVERITY_OPTIONS: IncidentSeverity[] = ['critical', 'high', 'medium']

export function AlertSettingsForm({
  initial,
  canEdit,
}: {
  initial: {
    enabled: boolean
    recipients: string[]
    min_severity: IncidentSeverity
    slack_webhook_url: string
    weekly_report: boolean
    siem_webhook_url: string
  }
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  const [enabled, setEnabled] = useState(initial.enabled)
  const [recipients, setRecipients] = useState<string[]>(initial.recipients)
  const [minSeverity, setMinSeverity] = useState<IncidentSeverity>(initial.min_severity)
  const [slackUrl, setSlackUrl] = useState(initial.slack_webhook_url)
  const [weekly, setWeekly] = useState(initial.weekly_report)
  const [siemUrl, setSiemUrl] = useState(initial.siem_webhook_url)

  function save() {
    setError(undefined)
    setSaved(false)
    startTransition(async () => {
      const supabase = createClient()
      const { error: e } = await supabase.rpc('set_alert_settings', {
        p_enabled: enabled,
        p_recipients: recipients,
        p_min_severity: minSeverity,
        p_slack_webhook_url: slackUrl.trim() || null,
        p_weekly_report: weekly,
        p_siem_webhook_url: siemUrl.trim() || null,
      })
      if (e) {
        setError(e.message)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Callout tone="info" title="Como funcionan las alertas">
        Cuando el motor de deteccion abre un incidente de la severidad elegida o mayor, Nortis
        envia un correo digest a estos destinatarios (a lo sumo uno cada diez minutos, agrupando
        los nuevos). El envio lo hace la plataforma; para activarlo, el operador debe cargar las
        credenciales de correo (Resend + dominio verificado). Mientras no esten, esta configuracion
        se guarda pero no se envia ningun correo.
      </Callout>

      <Card>
        <CardHeader>
          <CardTitle>Alertas por correo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="text-sm font-medium">Enviar alertas por correo</span>
              <span className="block text-xs text-muted-foreground">
                Desactivado, no se envia nada aunque haya destinatarios.
              </span>
            </span>
          </label>

          <div>
            <Label>Severidad minima</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((sev) => (
                <button
                  key={sev}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setMinSeverity(sev)}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
                    (minSeverity === sev
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-surface-muted text-muted-foreground hover:border-primary/40')
                  }
                >
                  {SEVERITY_LABEL[sev]} o mayor
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Recuerda que un dato clasificado como sensible sube la severidad del incidente.
            </p>
          </div>

          <StringListInput
            label="Destinatarios"
            help="Correos que reciben las alertas. Maximo 20."
            placeholder="seguridad@empresa.com"
            values={recipients}
            onChange={setRecipients}
            validate={validateEmail}
            disabled={!canEdit}
          />

          <div>
            <Label htmlFor="slack-url">Webhook de Slack (opcional)</Label>
            <Input
              id="slack-url"
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              disabled={!canEdit}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Si lo configuras, los incidentes de la severidad elegida se envian tambien a ese canal
              de Slack (o cualquier webhook https). Funciona independiente del correo.
            </p>
          </div>

          <div>
            <Label htmlFor="siem-url">Webhook SIEM (opcional)</Label>
            <Input
              id="siem-url"
              value={siemUrl}
              onChange={(e) => setSiemUrl(e.target.value)}
              placeholder="https://siem.empresa.com/collector"
              disabled={!canEdit}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Si lo configuras, los incidentes se envian tambien como JSON estructurado a ese
              endpoint (Splunk, Sentinel, un colector generico). Independiente del correo y Slack.
            </p>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={weekly}
              disabled={!canEdit}
              onChange={(e) => setWeekly(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="text-sm font-medium">Enviar un resumen semanal</span>
              <span className="block text-xs text-muted-foreground">
                Cada lunes, un correo con los incidentes abiertos de la semana a los mismos
                destinatarios.
              </span>
            </span>
          </label>

          {saved ? (
            <p className="text-sm text-success">Guardado.</p>
          ) : null}
          <FormError>{error}</FormError>

          {canEdit ? (
            <Button onClick={save} disabled={pending}>
              Guardar
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Solo un administrador puede cambiar las alertas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
