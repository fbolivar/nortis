import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'

/**
 * POST /api/agent/commands
 *
 * El agente reclama los comandos pendientes para su equipo (restaurar o borrar un
 * archivo en cuarentena). El RPC los marca 'sent' al devolverlos, de forma
 * atomica, para no repetir el encargo. Autenticado con la credencial del equipo,
 * como el resto de /api/agent.
 */
const pollSchema = z.object({ endpoint_id: z.string().uuid() })

export async function POST(request: Request) {
  return withAgentRequest(request, pollSchema, async (body, { credential, client }) => {
    const { data, error } = await client.rpc('agent_poll_commands', {
      p_credential: credential,
      p_endpoint_id: body.endpoint_id,
    })
    if (error) return mapPostgresError(error)

    return NextResponse.json({
      commands: (data ?? []).map((c) => ({
        id: c.id,
        kind: c.kind,
        quarantine_id: c.quarantine_id,
        original_path: c.original_path,
      })),
    })
  })
}
