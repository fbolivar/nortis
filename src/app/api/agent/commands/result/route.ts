import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'

/**
 * POST /api/agent/commands/result
 *
 * El agente informa el resultado de un comando: 'done' si lo ejecuto, 'failed'
 * con el motivo si no pudo (p. ej. el archivo original ya no existe, o la ruta
 * esta ocupada). La consola lo refleja en el estado de la accion.
 */
const resultSchema = z.object({
  endpoint_id: z.string().uuid(),
  command_id: z.string().uuid(),
  status: z.enum(['done', 'failed']),
  error: z.string().max(2000).optional(),
})

export async function POST(request: Request) {
  return withAgentRequest(request, resultSchema, async (body, { credential, client }) => {
    const { error } = await client.rpc('agent_report_command', {
      p_credential: credential,
      p_endpoint_id: body.endpoint_id,
      p_command_id: body.command_id,
      p_status: body.status,
      p_error: body.error,
    })
    if (error) return mapPostgresError(error)
    return NextResponse.json({ ok: true })
  })
}
