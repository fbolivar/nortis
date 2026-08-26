import crypto from 'node:crypto'

/**
 * FIRMA DE TAREAS DEL AGENTE — Ed25519
 * ============================================================================
 *
 * La consola encarga tareas que el agente ejecuta como SYSTEM (instalar un MSI,
 * colocar un archivo, reiniciar). Como es la capacidad mas peligrosa del
 * producto, el agente NO confia en la base ni en la API: solo ejecuta lo que
 * venga FIRMADO con la clave privada de la consola. Un atacante que inyecte una
 * fila en agent_tasks no puede forjar la firma, asi que el agente la rechaza.
 *
 * La clave privada vive SOLO en el servidor (`AGENT_SIGNING_PRIVKEY`, PKCS8 PEM,
 * Ed25519). Su clave publica correspondiente esta embebida en el binario del
 * agente (internal/tamper), la misma que ya verifica los vales de desinstalacion.
 *
 * BYTES CANONICOS — este archivo (Node) y `internal/remoteexec` (Go) construyen
 * EXACTAMENTE los mismos bytes o la verificacion falla. El contrato es:
 *
 *     "nortis-task-v1" \n <endpoint_id> \n <kind> \n <payload_text>
 *
 * donde `payload_text` son los MISMOS bytes que se guardan en la columna
 * `payload` (texto, no jsonb: jsonb los reserializaria y romperia la firma). La
 * caducidad (`not_after`, epoch en segundos) viaja DENTRO del payload firmado; el
 * agente la exige. `endpoint_id` ata la tarea a un equipo: una tarea firmada para
 * A no se puede reejecutar en B.
 */

const SIGN_PREFIX = 'nortis-task-v1'

export type TaskKind = 'install_msi' | 'push_file' | 'restart'

function loadPrivateKey(): crypto.KeyObject {
  const pem = process.env.AGENT_SIGNING_PRIVKEY
  if (!pem) {
    throw new Error(
      'AGENT_SIGNING_PRIVKEY no esta configurada: sin la clave privada la consola no puede firmar tareas del agente.',
    )
  }
  // En .env las claves multilinea suelen venir con \n escapados.
  return crypto.createPrivateKey(pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem)
}

/** Los bytes exactos sobre los que se calcula la firma. */
export function taskCanonicalBytes(
  endpointId: string,
  kind: TaskKind,
  payloadText: string,
): Buffer {
  return Buffer.from(`${SIGN_PREFIX}\n${endpointId}\n${kind}\n${payloadText}`, 'utf8')
}

/** Firma una tarea y devuelve la firma en base64. Ed25519 usa algoritmo `null`. */
export function signTask(endpointId: string, kind: TaskKind, payloadText: string): string {
  const key = loadPrivateKey()
  return crypto.sign(null, taskCanonicalBytes(endpointId, kind, payloadText), key).toString('base64')
}

/** `true` si hay clave privada configurada (para deshabilitar la UI si falta). */
export function taskSigningAvailable(): boolean {
  return Boolean(process.env.AGENT_SIGNING_PRIVKEY)
}
