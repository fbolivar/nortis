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

// Prefijo DER de una clave privada Ed25519 en PKCS8, al que solo le falta el
// seed de 32 bytes. Node no acepta la clave "cruda", pero si un PKCS8 armado.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

/** Cuerpo base64 de un PEM, sea cual sea su etiqueta. */
function pemBody(pem: string): Buffer {
  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/, '')
    .replace(/-----END[^-]+-----/, '')
    .replace(/\s+/g, '')
  return Buffer.from(b64, 'base64')
}

function loadPrivateKey(): crypto.KeyObject {
  const raw = process.env.AGENT_SIGNING_PRIVKEY
  if (!raw) {
    throw new Error(
      'AGENT_SIGNING_PRIVKEY no esta configurada: sin la clave privada la consola no puede firmar tareas del agente.',
    )
  }
  // En .env las claves multilinea suelen venir con \n escapados.
  const pem = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw

  // La herramienta de la consola (tools/uninstall-token) emite un PEM propietario
  // con la clave Ed25519 CRUDA (64 bytes: seed||pub), no PKCS8. Node no lo parsea
  // directo, asi que se toma el seed (primeros 32 bytes) y se envuelve en PKCS8.
  if (/NORTIS CONSOLE ED25519 PRIVATE KEY/.test(pem)) {
    const body = pemBody(pem)
    if (body.length !== 64 && body.length !== 32) {
      throw new Error('AGENT_SIGNING_PRIVKEY: clave Ed25519 con tamano inesperado')
    }
    const seed = body.subarray(0, 32)
    const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed])
    return crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
  }

  // PEM estandar (PKCS8) por si en el futuro se rota a ese formato.
  return crypto.createPrivateKey(pem)
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
