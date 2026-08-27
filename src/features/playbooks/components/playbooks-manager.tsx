'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus, Zap } from 'lucide-react'
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
  Input,
  Label,
} from '@/shared/components/ui'
import { SEVERITY_LABEL, CHANNEL_LABEL } from '@/features/incidents/types/incidents'
import type { IncidentSeverity } from '@/shared/types/database'

export interface PlaybookRule {
  id: string
  enabled: boolean
  name: string
  min_severity: IncidentSeverity
  match_channel: string | null
  action: string
}

/** Acciones que un playbook puede ejecutar (mapeadas a tareas firmadas). */
const ACTION_LABEL: Record<string, string> = {
  lock: 'Bloquear equipo',
  scan_av: 'Escaneo rapido de antivirus',
  network_isolate: 'Contener en la LAN',
  screenshot: 'Capturar pantalla',
  refresh_inventory: 'Actualizar inventario',
}

const SEVERITIES: IncidentSeverity[] = ['critical', 'high', 'medium']

export function PlaybooksManager({
  initial,
  canEdit,
}: {
  initial: PlaybookRule[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()

  const [name, setName] = useState('')
  const [minSeverity, setMinSeverity] = useState<IncidentSeverity>('high')
  const [channel, setChannel] = useState('')
  const [action, setAction] = useState('lock')

  function save(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(undefined)
    start(async () => {
      const { error: e } = await fn()
      if (e) setError(e.message)
      else router.refresh()
    })
  }

  function addRule() {
    if (name.trim() === '') return
    const supabase = createClient()
    save(() =>
      supabase.rpc('upsert_playbook_rule', {
        p_id: null,
        p_enabled: true,
        p_name: name.trim(),
        p_min_severity: minSeverity,
        p_match_channel: channel || null,
        p_action: action,
      })
    )
    setName('')
  }

  function toggle(r: PlaybookRule) {
    const supabase = createClient()
    save(() =>
      supabase.rpc('upsert_playbook_rule', {
        p_id: r.id,
        p_enabled: !r.enabled,
        p_name: r.name,
        p_min_severity: r.min_severity,
        p_match_channel: r.match_channel,
        p_action: r.action,
      })
    )
  }

  function remove(id: string) {
    if (!window.confirm('Eliminar esta regla de respuesta automatica?')) return
    const supabase = createClient()
    save(() => supabase.rpc('delete_playbook_rule', { p_id: id }))
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Callout tone="info" title="Como funcionan los playbooks">
        Cuando el motor abre un incidente de la severidad elegida (y del canal, si lo fijas), Nortis
        ejecuta sola la accion firmada sobre el equipo afectado. El disparo lo hace la plataforma;
        para activarlo, el operador debe cargar el secreto de playbooks. Mientras no este, las reglas
        se guardan pero no se ejecuta ninguna accion.
      </Callout>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Nueva regla</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pb-name">Nombre</Label>
              <Input
                id="pb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aislar ante amenaza activa"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="pb-sev">Severidad minima</Label>
                <select
                  id="pb-sev"
                  value={minSeverity}
                  onChange={(e) => setMinSeverity(e.target.value as IncidentSeverity)}
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]} o mayor
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="pb-ch">Canal (opcional)</Label>
                <select
                  id="pb-ch"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
                >
                  <option value="">Cualquiera</option>
                  {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="pb-act">Accion</Label>
                <select
                  id="pb-act"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
                >
                  {Object.entries(ACTION_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <FormError>{error}</FormError>
            <Button onClick={addRule} disabled={pending || name.trim() === ''}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Añadir regla
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Reglas ({initial.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {initial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aun no hay reglas de respuesta automatica.</p>
          ) : (
            initial.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" aria-hidden />
                    <span className="text-sm font-medium">{r.name}</span>
                    <Badge tone={r.enabled ? 'success' : 'neutral'}>
                      {r.enabled ? 'Activa' : 'Pausada'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {SEVERITY_LABEL[r.min_severity]} o mayor
                    {r.match_channel ? ` · canal ${CHANNEL_LABEL[r.match_channel] ?? r.match_channel}` : ' · cualquier canal'}
                    {' → '}
                    {ACTION_LABEL[r.action] ?? r.action}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => toggle(r)} disabled={pending}>
                      {r.enabled ? 'Pausar' : 'Activar'}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => remove(r.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
