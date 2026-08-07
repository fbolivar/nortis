import { NextResponse } from 'next/server'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'
import { policyRequestSchema } from '@/shared/schemas/agent-api'
import { POLICY_SCHEMA_VERSION } from '@/shared/schemas/policy'

/**
 * POST /api/agent/policy
 *
 * Devuelve la politica vigente del equipo. El servidor ya recorta los modulos
 * invasivos si el tenant no tiene consentimiento firmado, asi que el agente ni
 * siquiera recibe la instruccion de activarlos.
 */
export async function POST(request: Request) {
  return withAgentRequest(request, policyRequestSchema, async (body, { apiKey, client }) => {
    const { data, error } = await client.rpc('agent_policy', {
      p_api_key: apiKey,
      p_endpoint_id: body.endpoint_id,
    })

    if (error) return mapPostgresError(error)

    const row = Array.isArray(data) ? data[0] : data

    // Sin perfil asignado no se inventa una politica permisiva NI restrictiva:
    // se dice que no hay. El agente sigue observando sin intervenir, y el panel
    // ya reporta ese equipo como brecha de cobertura para que alguien actue.
    if (!row) {
      return NextResponse.json({ profile: null, console_schema_version: POLICY_SCHEMA_VERSION })
    }

    return NextResponse.json({
      profile: {
        id: row.profile_id,
        name: row.profile_name,
        schema_version: row.schema_version,
        config: row.config,
        updated_at: row.updated_at,
      },
      monitoring_allowed: row.monitoring_allowed,
      // El agente compara esto con lo que entiende: si la consola va por delante
      // debe seguir con la ultima politica conocida y reportarse desactualizado,
      // nunca aplicar reglas a medias.
      console_schema_version: POLICY_SCHEMA_VERSION,
    })
  })
}
