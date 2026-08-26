import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'

/**
 * POST /api/agent/tasks/result
 *
 * El agente informa el resultado de una tarea: 'running' al empezar (opcional),
 * 'done' con el exit code y la salida, o 'failed' con el motivo (firma invalida,
 * sha que no coincide, MSI que devolvio error). La consola lo audita.
 */
const resultSchema = z.object({
  endpoint_id: z.string().uuid(),
  task_id: z.string().uuid(),
  status: z.enum(['running', 'done', 'failed']),
  exit_code: z.number().int().optional(),
  output: z.string().max(16000).optional(),
  error: z.string().max(4000).optional(),
})

export async function POST(request: Request) {
  return withAgentRequest(request, resultSchema, async (body, { credential, client }) => {
    const { error } = await client.rpc('agent_report_task', {
      p_credential: credential,
      p_endpoint_id: body.endpoint_id,
      p_task_id: body.task_id,
      p_status: body.status,
      p_exit_code: body.exit_code,
      p_output: body.output,
      p_error: body.error,
    })
    if (error) return mapPostgresError(error)
    return NextResponse.json({ ok: true })
  })
}
