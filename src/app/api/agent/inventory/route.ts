import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'
import type { Json } from '@/shared/types/database'

/**
 * POST /api/agent/inventory
 *
 * El agente reporta su inventario de software y hardware. Solo METADATOS: nombres
 * de programa, version, publicador y datos de hardware; nunca rutas ni contenido.
 * El software se reemplaza entero en el servidor (un programa desinstalado
 * desaparece del inventario).
 */
const schema = z.object({
  endpoint_id: z.string().uuid(),
  hardware: z.record(z.string(), z.unknown()).nullish(),
  software: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        version: z.string().max(100).optional(),
        publisher: z.string().max(200).optional(),
      })
    )
    .max(5000)
    .default([]),
})

export async function POST(request: Request) {
  // La IP publica del equipo la ve el servidor en el origen de la peticion (el
  // agente esta tras NAT y no la conoce). x-forwarded-for trae la cadena de
  // proxies; la primera es el cliente real.
  const fwd = request.headers.get('x-forwarded-for') ?? ''
  const publicIp = fwd.split(',')[0]?.trim() || null

  return withAgentRequest(request, schema, async (body, { credential, client }) => {
    const { error } = await client.rpc('agent_report_inventory', {
      p_credential: credential,
      p_hardware: (body.hardware ?? {}) as Json,
      p_software: body.software as unknown as Json,
      p_ip: publicIp,
    })
    if (error) return mapPostgresError(error)
    return NextResponse.json({ ok: true })
  })
}
