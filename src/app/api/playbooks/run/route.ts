import 'server-only'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signTask, type TaskKind } from '@/shared/lib/agent-signing'
import type { Database } from '@/shared/types/database'

/**
 * POST /api/playbooks/run
 *
 * Ejecuta los playbooks de respuesta automatica: por cada incidente abierto que
 * cumple una regla, firma la accion y la emite al equipo. Lo dispara pg_cron
 * (via pg_net) con la cabecera x-playbook-secret; el mismo secreto autentica los
 * RPC en la base. La firma Ed25519 del agente sigue siendo la puerta final.
 *
 * No usa service_role: el cliente anon solo puede llegar a los RPC de playbook,
 * y estos exigen el secreto. Sin PLAYBOOK_SECRET / AGENT_SIGNING_PRIVKEY /
 * secreto en Vault, no se emite nada (queda listo a la espera de credenciales).
 */

const TTL_SECONDS = 6 * 60 * 60

/** Payload por accion. La ruta añade not_after al firmar. */
function payloadFor(kind: TaskKind): Record<string, unknown> {
  switch (kind) {
    case 'scan_av':
      return { type: 'quick' }
    case 'network_isolate':
      return { enable: true }
    default:
      return {}
  }
}

export async function POST(request: Request) {
  const secret = process.env.PLAYBOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PLAYBOOK_SECRET no configurado' }, { status: 503 })
  }
  if (request.headers.get('x-playbook-secret') !== secret) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: pending, error } = await supabase.rpc('pending_playbook_actions', {
    p_secret: secret,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let issued = 0
  const errors: string[] = []
  for (const row of pending ?? []) {
    const kind = row.kind as TaskKind
    const startEpoch = Math.floor(Date.now() / 1000)
    const notAfter = startEpoch + TTL_SECONDS
    const payloadText = JSON.stringify({ ...payloadFor(kind), not_after: notAfter })
    let signature: string
    try {
      signature = signTask(row.endpoint_id, kind, payloadText)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'firma')
      continue
    }
    const { error: e2 } = await supabase.rpc('issue_playbook_action', {
      p_secret: secret,
      p_incident_id: row.incident_id,
      p_endpoint_id: row.endpoint_id,
      p_kind: kind,
      p_payload: payloadText,
      p_expires_at: new Date(notAfter * 1000).toISOString(),
      p_signature: signature,
      p_not_before: new Date(startEpoch * 1000).toISOString(),
    })
    if (e2) errors.push(e2.message)
    else issued++
  }

  return NextResponse.json({ issued, errors })
}
