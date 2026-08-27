'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormError,
  Input,
  Label,
} from '@/shared/components/ui'
import { formatRelative } from '@/lib/utils'

export interface ExceptionRow {
  id: string
  kind: 'usb' | 'app' | 'web'
  value: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  endpoint_hostname: string | null
  expires_at: string | null
  created_at: string
}

const KIND_LABEL: Record<string, string> = { usb: 'USB (serial)', app: 'Aplicacion', web: 'Dominio web' }
const STATUS_TONE: Record<string, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

export function ExceptionsManager({
  initial,
  endpoints,
  canApprove,
}: {
  initial: ExceptionRow[]
  endpoints: { id: string; hostname: string }[]
  canApprove: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()

  const [kind, setKind] = useState<'usb' | 'app' | 'web'>('app')
  const [value, setValue] = useState('')
  const [endpointId, setEndpointId] = useState('')
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('30')

  function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(undefined)
    start(async () => {
      const { error: e } = await fn()
      if (e) setError(e.message)
      else router.refresh()
    })
  }

  function request() {
    if (value.trim() === '') return
    const supabase = createClient()
    run(() =>
      supabase.rpc('request_exception', {
        p_kind: kind,
        p_value: value.trim(),
        p_endpoint_id: endpointId || null,
        p_reason: reason.trim() || null,
      })
    )
    setValue('')
    setReason('')
  }

  function resolve(id: string, approve: boolean) {
    const supabase = createClient()
    run(() => {
      const expires =
        approve && Number(days) > 0
          ? new Date(Date.now() + Number(days) * 86400000).toISOString()
          : null
      return supabase.rpc('resolve_exception', { p_id: id, p_approve: approve, p_expires_at: expires })
    })
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Solicitar una excepcion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="exc-kind">Tipo</Label>
              <select
                id="exc-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'usb' | 'app' | 'web')}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
              >
                <option value="app">Aplicacion (ej: teamviewer.exe)</option>
                <option value="usb">USB (serial del dispositivo)</option>
                <option value="web">Dominio web (ej: wetransfer.com)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="exc-ep">Equipo (opcional)</Label>
              <select
                id="exc-ep"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
              >
                <option value="">Toda la organizacion</option>
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.hostname}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="exc-value">Valor</Label>
            <Input
              id="exc-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'app' ? 'teamviewer.exe' : kind === 'web' ? 'wetransfer.com' : 'KINGSTON-A7F31C'}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="exc-reason">Motivo (opcional)</Label>
            <Input
              id="exc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Soporte remoto del proveedor por 1 mes"
            />
          </div>
          <FormError>{error}</FormError>
          <Button onClick={request} disabled={pending || value.trim() === ''}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Solicitar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Excepciones ({initial.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {initial.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay excepciones.</p>
          ) : (
            initial.map((x) => (
              <div
                key={x.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{KIND_LABEL[x.kind]}</Badge>
                    <span className="font-mono text-sm">{x.value}</span>
                    <Badge tone={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {x.endpoint_hostname ?? 'Toda la organizacion'}
                    {x.reason ? ` · ${x.reason}` : ''}
                    {x.status === 'approved' && x.expires_at
                      ? ` · vence ${formatRelative(x.expires_at)}`
                      : ''}
                    {' · '}
                    {formatRelative(x.created_at)}
                  </p>
                </div>
                {canApprove && x.status === 'pending' ? (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => resolve(x.id, true)} disabled={pending}>
                      <Check className="mr-1 h-4 w-4" aria-hidden />
                      Aprobar
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => resolve(x.id, false)} disabled={pending}>
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
          {canApprove ? (
            <div className="flex items-center gap-2 pt-1">
              <Label htmlFor="exc-days" className="mb-0 text-xs">
                Caducidad al aprobar (dias, 0 = sin caducidad)
              </Label>
              <Input
                id="exc-days"
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="max-w-[6rem]"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
