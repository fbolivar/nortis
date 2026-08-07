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
  Label,
} from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import { STATUS_HELP, STATUS_LABEL, STATUS_TONE } from '../types/incidents'
import type { DlpIncident, IncidentStatus } from '@/shared/types/database'

const TRANSITIONS: IncidentStatus[] = ['reviewed', 'closed', 'false_positive']

export function IncidentReview({
  incident,
  reviewerEmail,
  canReview,
}: {
  incident: DlpIncident
  reviewerEmail: string | null
  canReview: boolean
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(incident.review_notes ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  async function applyStatus(next: IncidentStatus) {
    setError(undefined)
    setPending(true)

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

    const { error: updateError } = await supabase
      .from('dlp_incidents')
      .update({
        status: next,
        review_notes: notes.trim() || null,
        reviewed_by: userData.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', incident.id)

    setPending(false)

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
            <CardTitle>Revision</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {STATUS_HELP[incident.status]}
            </p>
          </div>
          <Badge tone={STATUS_TONE[incident.status]}>{STATUS_LABEL[incident.status]}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {incident.reviewed_at ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Revisado por</dt>
              <dd className="mt-0.5 text-sm">{reviewerEmail ?? 'Usuario eliminado'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fecha de revision</dt>
              <dd className="mt-0.5 text-sm tabular-nums">
                {formatDateTime(incident.reviewed_at)}
              </dd>
            </div>
          </dl>
        ) : null}

        {canReview ? (
          <>
            <div>
              <Label htmlFor="notes">Notas de revision</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Que se verifico, con quien se hablo, que decision se tomo."
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Quedan asociadas al incidente de forma permanente. En una auditoria, un
                incidente cerrado sin explicacion vale lo mismo que uno sin revisar.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {TRANSITIONS.map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant={next === 'false_positive' ? 'ghost' : 'secondary'}
                  onClick={() => applyStatus(next)}
                  disabled={pending || incident.status === next}
                >
                  {STATUS_LABEL[next]}
                </Button>
              ))}
            </div>

            <FormError>{error}</FormError>

            {incident.status !== 'open' ? (
              // Reabrir es una transicion legitima —a veces una revision se hace
              // con informacion incompleta— pero se separa del resto para que no
              // se pulse por descuido.
              <Button
                size="sm"
                variant="ghost"
                onClick={() => applyStatus('open')}
                disabled={pending}
              >
                Reabrir incidente
              </Button>
            ) : null}
          </>
        ) : (
          <Callout tone="neutral">
            Su rol permite consultar los incidentes pero no cambiar su estado.
          </Callout>
        )}
      </CardContent>
    </Card>
  )
}
