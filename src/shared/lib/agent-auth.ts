import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { agentApiKey, agentEndpointCredential } from '@/shared/schemas/agent-api'
import type { Database } from '@/shared/types/database'

/**
 * Cliente para la superficie del agente.
 *
 * Usa la ANON key, no la service_role. Toda operacion privilegiada pasa por
 * funciones SECURITY DEFINER que se autentican con la API key que presenta el
 * agente, de modo que su autoridad queda acotada al tenant dueño de esa clave.
 *
 * La consecuencia practica es que un fallo en cualquiera de estos handlers no
 * puede comprometer a otros clientes: no hay ninguna credencial global que
 * robar. Con service_role, un solo error de logica aqui expondria la telemetria
 * de todos los tenants a la vez.
 */
function agentClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export interface AgentContext {
  /** `nrt_live_…` en el alta, `nrt_ep_…` en el resto de rutas. */
  credential: string
  client: ReturnType<typeof agentClient>
}

/** Respuesta de error uniforme. El agente distingue por `code`, no por el texto. */
export function agentError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * Traduce un error de Postgres al codigo HTTP correcto.
 *
 * Importa para el agente: un 429 significa "reintenta con retroceso", un 401
 * significa "tu credencial ya no sirve, deja de intentarlo" y un 400 significa
 * "este lote esta mal, no lo reenvies". Devolver 500 para todo haria que el
 * agente reintentara eternamente un lote que nunca va a entrar.
 */
export function mapPostgresError(error: { code?: string; message: string }) {
  switch (error.code) {
    case '42501':
      return agentError(401, 'unauthorized', 'Credencial invalida o sin permiso')
    case '53400':
      return agentError(429, 'rate_limited', 'Limite de tasa excedido')
    case '22023':
      return agentError(400, 'invalid_request', error.message)
    default:
      // El mensaje crudo de Postgres no se expone: puede revelar nombres de
      // objetos internos. Se registra en el servidor y al agente se le da lo
      // justo para saber que reintente.
      console.error('[api/agent] error de base de datos', error)
      return agentError(500, 'internal_error', 'Error interno')
  }
}

/**
 * Extrae y valida la credencial del encabezado Authorization.
 *
 * Solo Bearer. Aceptar la clave por query string seria mucho mas comodo para
 * depurar y precisamente por eso no se hace: las query strings acaban en los
 * logs de acceso de cualquier proxy, y la credencial de un agente da acceso de
 * escritura a la telemetria de todo un tenant.
 */
export function extractApiKey(
  request: Request,
  /**
   * Que credencial admite esta ruta. `organization` solo en el alta; el resto de
   * la superficie exige la del equipo.
   *
   * Se comprueba aqui, por formato, antes de tocar la base: presentar la clave
   * del tenant en /events debe fallar por contrato, no por que la base no
   * encuentre el hash. Ese error acabaria mezclado con "credencial revocada" y
   * mandaria a depurar al sitio equivocado.
   */
  kind: 'organization' | 'endpoint' = 'endpoint'
): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null

  const schema = kind === 'organization' ? agentApiKey : agentEndpointCredential
  const parsed = schema.safeParse(header.slice(7).trim())
  return parsed.success ? parsed.data : null
}

/** Envuelve un handler con autenticacion y validacion de cuerpo. */
export async function withAgentRequest<T>(
  request: Request,
  schema: ZodType<T>,
  handler: (body: T, context: AgentContext) => Promise<NextResponse>,
  credentialKind: 'organization' | 'endpoint' = 'endpoint'
): Promise<NextResponse> {
  const apiKey = extractApiKey(request, credentialKind)
  if (!apiKey) {
    return agentError(
      401,
      'unauthorized',
      credentialKind === 'organization'
        ? 'Falta la credencial de organizacion (Authorization: Bearer nrt_live_…)'
        : 'Falta la credencial del equipo (Authorization: Bearer nrt_ep_…)'
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return agentError(400, 'invalid_request', 'El cuerpo no es JSON valido')
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return agentError(
      400,
      'invalid_request',
      parsed.error.issues[0]?.message ?? 'Cuerpo invalido'
    )
  }

  try {
    return await handler(parsed.data, { credential: apiKey, client: agentClient() })
  } catch (e) {
    console.error('[api/agent] excepcion no controlada', e)
    return agentError(500, 'internal_error', 'Error interno')
  }
}
