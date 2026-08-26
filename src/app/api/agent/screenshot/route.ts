import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'

/**
 * POST /api/agent/screenshot
 *
 * Recibe una captura de pantalla en base64 y la guarda. El RPC exige
 * consentimiento firmado del tenant; sin el, la descarta. La imagen es CONTENIDO,
 * por eso todo este camino esta gateado por consentimiento (Ley 1581).
 */
const schema = z.object({
  endpoint_id: z.string().uuid(),
  // ~6 MB de base64 (cubre el tope de 4 MB de PNG del agente con margen).
  image_base64: z.string().min(1).max(6_000_000),
})

export async function POST(request: Request) {
  return withAgentRequest(request, schema, async (body, { credential, client }) => {
    const { error } = await client.rpc('agent_report_screenshot', {
      p_credential: credential,
      p_image_base64: body.image_base64,
    })
    if (error) return mapPostgresError(error)
    return NextResponse.json({ ok: true })
  })
}
