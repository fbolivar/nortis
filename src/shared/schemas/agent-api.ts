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

/**
 * DOS CREDENCIALES DISTINTAS, CON PROPOSITOS DISTINTOS
 * ----------------------------------------------------------------------------
 * `nrt_live_` es la API key del TENANT y solo sirve para dar de alta un equipo.
 * `nrt_ep_` es la credencial del EQUIPO, que devuelve el enrolamiento una sola
 * vez y con la que se hace todo lo demas.
 *
 * La separacion existe porque antes la clave del tenant vivia en cada portatil
 * de la flota: quien extrajera la de un solo equipo podia falsear telemetria de
 * cualquier otro. Con esto, el instalador puede borrar la clave del tenant en
 * cuanto termina el alta, y perder un portatil no obliga a rotar la credencial
 * de los otros doscientos.
 *
 * Los prefijos son distintos a proposito: una no puede usarse en lugar de la
 * otra ni por accidente, y el error lo dice el propio formato antes de tocar la
 * base.
 */
export const agentApiKey = z
  .string()
  .regex(/^nrt_live_[0-9a-f]{64}$/, 'Credencial de organizacion con formato invalido')

export const agentEndpointCredential = z
  .string()
  .regex(/^nrt_ep_[0-9a-f]{64}$/, 'Credencial de equipo con formato invalido')

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
        /**
         * Identificador de deduplicacion. Lo genera el agente UNA vez por evento
         * y lo conserva entre reintentos.
         *
         * Es obligatorio. Sin el, un lote confirmado por el servidor cuya
         * respuesta se pierde —timeout, cambio de red— se reinserta entero al
         * reintentar: eventos duplicados e incidentes DLP repetidos. Con
         * portatiles y conectividad intermitente ese es el caso normal.
         *
         * La base lo trata como opcional (columna nullable) porque los datos
         * sembrados por demo_telemetry.sql no lo llevan; para todo lo que entre
         * por esta API, se exige aqui.
         */
        client_event_id: uuid,
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
