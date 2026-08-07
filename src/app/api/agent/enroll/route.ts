import { NextResponse } from 'next/server'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'
import { enrollRequestSchema } from '@/shared/schemas/agent-api'

/**
 * POST /api/agent/enroll
 *
 * Registro inicial del agente. Idempotente por huella de maquina: reinstalar el
 * agente actualiza el equipo existente en vez de duplicarlo en el inventario
 * (y en la facturacion, que se cobra por equipo).
 */
export async function POST(request: Request) {
  return withAgentRequest(request, enrollRequestSchema, async (body, { apiKey, client }) => {
    const { data, error } = await client.rpc('agent_enroll', {
      p_api_key: apiKey,
      p_fingerprint: body.machine_fingerprint,
      p_hostname: body.hostname,
      p_os_version: body.os_version ?? null,
      p_agent_version: body.agent_version ?? null,
      p_user: body.user ?? null,
    })

    if (error) return mapPostgresError(error)

    const row = Array.isArray(data) ? data[0] : data
    if (!row) return mapPostgresError({ code: '42501', message: 'Sin resultado' })

    return NextResponse.json({
      endpoint_id: row.endpoint_id,
      profile_id: row.profile_id,
      organization_id: row.organization_id,
    })
  })
}
