import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'

/**
 * POST /api/agent/tasks
 *
 * El agente reclama las tareas pendientes para su equipo (instalar un MSI,
 * colocar un archivo, reiniciar). El RPC las marca 'sent' de forma atomica al
 * devolverlas. Cada tarea viaja FIRMADA: el agente verifica la firma con la clave
 * publica de la consola antes de ejecutar nada, asi que una fila inyectada sin
 * firma valida no se ejecuta.
 */
const pollSchema = z.object({ endpoint_id: z.string().uuid() })

export async function POST(request: Request) {
  return withAgentRequest(request, pollSchema, async (body, { credential, client }) => {
    const { data, error } = await client.rpc('agent_poll_tasks', {
      p_credential: credential,
      p_endpoint_id: body.endpoint_id,
    })
    if (error) return mapPostgresError(error)

    return NextResponse.json({
      tasks: (data ?? []).map((t) => ({
        id: t.id,
        kind: t.kind,
        payload: t.payload,
        expires_at: t.expires_at,
        signature: t.signature,
      })),
    })
  })
}
