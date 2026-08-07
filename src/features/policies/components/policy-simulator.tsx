'use client'

import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
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
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import type { PolicyConfig } from '@/shared/schemas/policy'
import type { Json } from '@/shared/types/database'

interface SimulationRow {
  rule_key: string
  channel: string
  action: string
  affected_events: number
  affected_endpoints: number
  sample: string | null
}

const RULE_LABEL: Record<string, string> = {
  'storage.carpeta_no_autorizada': 'Guardado fuera de carpeta autorizada',
  'storage.extension_prohibida': 'Extension prohibida',
  'usb.dispositivo_no_autorizado': 'Dispositivo USB no autorizado',
  'web.dominio_bloqueado': 'Dominio bloqueado',
  'web.fuera_de_lista_blanca': 'Sitio fuera de la lista blanca',
  'web.webmail_bloqueado': 'Correo personal bloqueado',
  'clipboard.copia_desde_origen_protegido': 'Copia desde origen protegido',
  'print.trabajo_intervenido': 'Trabajo de impresion intervenido',
}

const ACTION_LABEL: Record<string, string> = {
  block: 'Bloqueado',
  read_only: 'Solo lectura',
  alert: 'Alerta',
  log: 'Registrado',
}

/** Bloquear rompe trabajo; alertar y registrar no. La tabla debe distinguirlo. */
function actionTone(action: string): 'critical' | 'warning' | 'info' {
  if (action === 'block') return 'critical'
  if (action === 'read_only' || action === 'alert') return 'warning'
  return 'info'
}

export function PolicySimulator({
  config,
  endpoints,
}: {
  config: PolicyConfig
  endpoints: { id: string; hostname: string }[]
}) {
  const [rows, setRows] = useState<SimulationRow[]>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [days, setDays] = useState(14)
  const [scope, setScope] = useState<string>('')

  async function run() {
    setError(undefined)
    setPending(true)

    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('simulate_policy', {
      p_config: config as unknown as Json,
      p_endpoints: scope ? [scope] : null,
      p_days: days,
    })

    setPending(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setRows((data ?? []) as SimulationRow[])
  }

  const blocking = (rows ?? []).filter((r) => r.action === 'block')
  const totalBlocked = blocking.reduce((sum, r) => sum + r.affected_events, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Simulador de politica</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Que habria pasado si este perfil hubiera estado activo
            </p>
          </div>
          {/* Envuelve en movil: tres controles en fila fija desbordaban el
              documento y arrastraban el scroll horizontal a toda la pagina. */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-10 rounded-full border border-border bg-surface px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
              aria-label="Equipos a simular"
            >
              <option value="">Todos los equipos</option>
              {endpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.hostname}
                </option>
              ))}
            </select>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-10 rounded-full border border-border bg-surface px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
              aria-label="Periodo a simular"
            >
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
            </select>
            <Button size="sm" onClick={run} disabled={pending}>
              <FlaskConical className="h-3.5 w-3.5" aria-hidden />
              {pending ? 'Simulando…' : 'Simular'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-0">
        {error ? (
          <div className="px-4 py-3">
            <Callout tone="critical" title="No se pudo simular">
              {error}
            </Callout>
          </div>
        ) : null}

        {rows === undefined ? (
          <EmptyState
            title="Sin simular"
            description="Ejecute la simulacion para ver cuanta actividad real de sus equipos habria intervenido este perfil antes de desplegarlo."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Este perfil no habria intervenido nada"
            description="Ninguna regla coincide con la actividad registrada en el periodo. Puede significar que el perfil es seguro de desplegar, o que todavia no restringe nada."
          />
        ) : (
          <>
            {totalBlocked > 0 ? (
              <div className="px-4 pt-3">
                <Callout
                  tone={totalBlocked > 100 ? 'critical' : 'warning'}
                  title={`${totalBlocked.toLocaleString('es-CO')} acciones se habrian bloqueado`}
                >
                  {totalBlocked > 100
                    ? 'Es un volumen alto de trabajo interrumpido. Un perfil que corta cientos de acciones legitimas al dia termina con el agente desinstalado: revise si conviene empezar en modo alerta y endurecerlo despues.'
                    : 'Revise la muestra de cada regla para confirmar que se trata de actividad que realmente quiere impedir.'}
                </Callout>
              </div>
            ) : null}

            <Table>
              <thead>
                <tr>
                  <Th>Regla</Th>
                  <Th>Accion</Th>
                  <Th>Eventos</Th>
                  <Th>Equipos</Th>
                  <Th>Ejemplo</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rule_key} className="hover:bg-surface-muted">
                    <Td>{RULE_LABEL[row.rule_key] ?? row.rule_key}</Td>
                    <Td>
                      <Badge tone={actionTone(row.action)}>
                        {ACTION_LABEL[row.action] ?? row.action}
                      </Badge>
                    </Td>
                    <Td className="tabular-nums">
                      {row.affected_events.toLocaleString('es-CO')}
                    </Td>
                    <Td className="tabular-nums text-muted-foreground">
                      {row.affected_endpoints}
                    </Td>
                    <Td className="forensic max-w-xs truncate" title={row.sample ?? ''}>
                      {row.sample ?? '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <p className="px-4 pb-3 text-xs text-muted-foreground">
              Estas cifras son una <strong className="text-foreground">cota superior</strong>.
              La telemetria registra lo que ocurrio bajo la politica anterior: si la nueva
              hubiera bloqueado una accion, el usuario probablemente habria intentado otra
              cosa. Sirve para dimensionar el impacto, no para predecirlo exactamente.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
