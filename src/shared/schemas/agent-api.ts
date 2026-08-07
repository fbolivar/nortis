import { z } from 'zod'

/**
 * CONTRATO HTTP DE /api/agent
 * ============================================================================
 *
 * Lo que el agente Go envia por la red. Complementa a telemetry.ts (que define
 * la forma del `payload` de cada evento) y a policy.ts (la forma de lo que el
 * agente recibe de vuelta).
 *
 * IMPORTANTE SOBRE EL PAPEL DE ESTA VALIDACION: es defensa en profundidad y
 * mejores mensajes de error, NO el control de seguridad. Las funciones que hay
 * debajo son alcanzables por PostgREST, asi que un atacante con una credencial
 * valida puede saltarse estos Route Handlers por completo. Por eso los limites
 * que de verdad importan —tamaño de lote, tasa, pertenencia del equipo al
 * tenant, recorte del titulo de ventana sin consentimiento— son invariantes de
 * la base de datos y estan repetidos alli.
 */

/** Formato exacto que produce create_api_key: nrt_live_ + 64 hex. */
export const agentApiKey = z
  .string()
  .regex(/^nrt_live_[0-9a-f]{64}$/, 'Credencial con formato invalido')

const uuid = z.string().uuid('Identificador invalido')

export const enrollRequestSchema = z.object({
  /**
   * Identidad estable de la maquina que deriva el agente. Se exige longitud
   * minima para que un agente mal implementado no registre todos los equipos
   * bajo la misma huella y los colapse en una sola fila del inventario.
   */
  machine_fingerprint: z.string().min(8).max(255),
  hostname: z.string().min(1).max(255),
  os_version: z.string().max(255).optional(),
  agent_version: z.string().max(64).optional(),
  user: z.string().max(255).optional(),
})

export const MAX_BATCH_EVENTS = 1000

export const ingestRequestSchema = z.object({
  endpoint_id: uuid,
  events: z
    .array(
      z.object({
        event_type: z.string().min(1).max(64),
        occurred_at: z.string().datetime({ offset: true }),
        payload: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(MAX_BATCH_EVENTS, `El lote no puede exceder ${MAX_BATCH_EVENTS} eventos`),
})

export const policyRequestSchema = z.object({ endpoint_id: uuid })

export const heartbeatRequestSchema = z.object({
  endpoint_id: uuid,
  agent_version: z.string().max(64).optional(),
  user: z.string().max(255).optional(),
})

/**
 * Version minima de agente admitida.
 *
 * Un agente por debajo de esta version puede no entender el esquema de politica
 * vigente, y aplicar media politica de seguridad es peor que no aplicarla:
 * el panel mostraria el equipo como cubierto cuando no lo esta.
 */
export const MIN_AGENT_VERSION = '1.0.0'
export const CURRENT_AGENT_VERSION = '1.0.0'

/** Compara versiones semanticas simples (mayor.menor.parche). */
export function isVersionAtLeast(version: string | undefined, minimum: string): boolean {
  if (!version) return false
  const parse = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const [a, b, c] = parse(version)
  const [x, y, z] = parse(minimum)
  if (a !== x) return a > x
  if (b !== y) return b > y
  return c >= z
}
