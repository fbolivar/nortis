import { NextResponse } from 'next/server'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'
import { enrollRequestSchema } from '@/shared/schemas/agent-api'

/**
 * POST /api/agent/enroll
 *
 * Registro inicial del agente. Idempotente por huella de maquina: reinstalar el
 * agente actualiza el equipo existente en vez de duplicarlo en el inventario
 * (y en la facturacion, que se cobra por equipo).
 *
 * UNICA RUTA QUE ACEPTA LA CREDENCIAL DE LA ORGANIZACION (`nrt_live_…`), y lo
 * que devuelve a cambio es la credencial propia del equipo (`nrt_ep_…`) con la
 * que se hace todo lo demas.
 *
 * `agent_credential` viaja en claro UNA sola vez, aqui. En la base solo queda su
 * hash, igual que con las API keys: si se pierde, se vuelve a enrolar el equipo.
 * El instalador debe guardarla protegida y borrar la clave de la organizacion
 * del disco en cuanto termina — dejarla ahi reabriria el hueco que esta
 * separacion cierra.
 */
export async function POST(request: Request) {
  return withAgentRequest(
    request,
    enrollRequestSchema,
    async (body, { credential, client }) => {
      const { data, error } = await client.rpc('agent_enroll', {
        p_api_key: credential,
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
        agent_credential: row.agent_credential,
      })
    },
    'organization'
  )
}
