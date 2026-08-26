import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'

/**
 * POST /api/agent/classifications
 *
 * Devuelve las reglas de CONTENIDO (expresiones regulares) con las que el agente
 * clasifica archivos localmente. El servidor solo las entrega si el tenant firmo
 * la autorizacion de tratamiento de datos: sin ella, el agente no inspecciona
 * contenido. El agente evalua las reglas y reporta solo la ETIQUETA, nunca el
 * contenido del archivo.
 */
const schema = z.object({ endpoint_id: z.string().uuid() })

export async function POST(request: Request) {
  return withAgentRequest(request, schema, async (_body, { credential, client }) => {
    const { data, error } = await client.rpc('agent_classifications', { p_credential: credential })
    if (error) return mapPostgresError(error)

    return NextResponse.json({
      classifications: (data ?? []).map((c) => ({
        name: c.name,
        content_patterns: c.content_patterns,
      })),
    })
  })
}
