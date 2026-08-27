import { NextResponse } from 'next/server'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'
import { policyRequestSchema } from '@/shared/schemas/agent-api'
import { POLICY_SCHEMA_VERSION } from '@/shared/schemas/policy'
import { expandWebCategories } from '@/shared/lib/web-categories'
import { mergePolicyExceptions, type ActiveException } from '@/shared/lib/policy-exceptions'

/**
 * POST /api/agent/policy
 *
 * Devuelve la politica vigente del equipo. El servidor ya recorta los modulos
 * invasivos si el tenant no tiene consentimiento firmado, asi que el agente ni
 * siquiera recibe la instruccion de activarlos.
 */
export async function POST(request: Request) {
  return withAgentRequest(request, policyRequestSchema, async (body, { credential, client }) => {
    const { data, error } = await client.rpc('agent_policy', {
      p_credential: credential,
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

    // Excepciones aprobadas y vigentes del equipo: se fusionan en la politica
    // (autorizar un USB, permitir una app, desbloquear un dominio). Si falla la
    // consulta, se sigue con la politica base — una excepcion no aplicada es el
    // lado seguro (mas restrictivo), nunca al reves.
    let exceptions: ActiveException[] = []
    const { data: exc } = await client.rpc('agent_active_exceptions', {
      p_credential: credential,
      p_endpoint_id: body.endpoint_id,
    })
    if (Array.isArray(exc)) {
      exceptions = exc.map((e) => ({ kind: e.kind as ActiveException['kind'], value: e.value }))
    }

    return NextResponse.json({
      profile: {
        id: row.profile_id,
        name: row.profile_name,
        schema_version: row.schema_version,
        // Las categorias web se expanden a dominios y luego se aplican las
        // excepciones vigentes, todo antes de mandar la config al agente.
        config: mergePolicyExceptions(expandWebCategories(row.config), exceptions),
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
