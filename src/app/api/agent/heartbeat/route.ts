import { NextResponse } from 'next/server'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'
import { heartbeatRequestSchema } from '@/shared/schemas/agent-api'

/**
 * POST /api/agent/heartbeat
 *
 * Señal de vida. Devuelve la fecha de la politica vigente para que el agente
 * sepa si debe volver a descargarla, en vez de pedirla entera en cada latido —
 * con doscientos equipos latiendo cada minuto, la diferencia es real.
 *
 * Tambien informa si el equipo esta en cuarentena, para que el agente pueda
 * endurecerse sin esperar al siguiente ciclo de politica.
 */
export async function POST(request: Request) {
  return withAgentRequest(request, heartbeatRequestSchema, async (body, { credential, client }) => {
    const { data, error } = await client.rpc('agent_heartbeat', {
      p_credential: credential,
      p_endpoint_id: body.endpoint_id,
      p_agent_version: body.agent_version ?? null,
      p_user: body.user ?? null,
    })

    if (error) return mapPostgresError(error)

    const row = Array.isArray(data) ? data[0] : data

    return NextResponse.json({
      acknowledged: row?.acknowledged ?? false,
      policy_updated_at: row?.policy_updated_at ?? null,
      quarantined: row?.quarantined ?? false,
    })
  })
}
