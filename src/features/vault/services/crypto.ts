/**
 * CIFRADO EN EL NAVEGADOR — Web Crypto API
 * ============================================================================
 *
 * Todo lo de este archivo corre en el equipo del usuario. El texto plano nunca
 * viaja por la red ni pasa por la memoria del servidor de Next.js.
 *
 * Esquema: AES-256-GCM. GCM y no CBC porque trae autenticacion integrada — si
 * alguien altera un solo byte del ciphertext, el descifrado FALLA en vez de
 * devolver basura silenciosamente. En un producto que promete integridad de
 * documentos, esa diferencia es el producto.
 *
 * Cifrado por sobre: cada documento lleva su propia clave de datos aleatoria.
 * Comprometer un documento no compromete ninguno de los demas, y rotar la clave
 * maestra del tenant solo obliga a re-envolver claves de 32 bytes, no a
 * re-cifrar gigabytes de archivos.
 */

/** Bytes aleatorios del CSPRNG del navegador. */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // En trozos: String.fromCharCode(...arr) con un array de megabytes desborda
  // la pila de argumentos y lanza RangeError.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Token seguro para URLs. */
export function randomToken(bytes = 32): string {
  return toBase64(randomBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Metadatos que viajan DENTRO del ciphertext.
 *
 * El nombre del archivo y su tipo se cifran junto al contenido y no se guardan
 * en columnas aparte. "liquidacion_despido_juan_perez.docx" revela el secreto
 * sin necesidad de abrir nada, y un destinatario externo tampoco podria leer un
 * nombre cifrado con la clave del tenant.
 */
interface PayloadHeader {
  filename: string
  mime: string
  size: number
}

const MAGIC = 'NRTS1'

/**
 * Empaqueta cabecera + contenido en un solo buffer antes de cifrar:
 *   MAGIC(5) | headerLength(4, big endian) | headerJSON | fileBytes
 */
function packPayload(header: PayloadHeader, file: Uint8Array): Uint8Array<ArrayBuffer> {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const magic = new TextEncoder().encode(MAGIC)
  const out = new Uint8Array(magic.length + 4 + headerBytes.length + file.length)

  out.set(magic, 0)
  new DataView(out.buffer).setUint32(magic.length, headerBytes.length, false)
  out.set(headerBytes, magic.length + 4)
  out.set(file, magic.length + 4 + headerBytes.length)

  return out
}

function unpackPayload(buffer: Uint8Array): { header: PayloadHeader; file: Uint8Array<ArrayBuffer> } {
  const magic = new TextDecoder().decode(buffer.subarray(0, MAGIC.length))
  if (magic !== MAGIC) {
    throw new Error('El contenido descifrado no tiene el formato esperado')
  }

  const headerLength = new DataView(
    buffer.buffer,
    buffer.byteOffset + MAGIC.length,
    4
  ).getUint32(0, false)

  const headerStart = MAGIC.length + 4
  const header = JSON.parse(
    new TextDecoder().decode(buffer.subarray(headerStart, headerStart + headerLength))
  ) as PayloadHeader

  return { header, file: buffer.slice(headerStart + headerLength) }
}

/* -------------------------------------------------------------- Cifrado --- */

export interface EncryptedResult {
  /** Ciphertext listo para subir (IV incluido al inicio). */
  blob: Blob
  /** Clave de datos en base64, para que el servidor la envuelva. */
  dataKey: string
  /** SHA-256 del texto PLANO: detecta reenvios del mismo documento. */
  contentHash: string
  /** SHA-256 del nombre original. Identificador estable sin valor semantico. */
  filenameHash: string
  plainSize: number
}

export async function encryptFile(file: File): Promise<EncryptedResult> {
  const raw = new Uint8Array(await file.arrayBuffer())

  const contentHash = await sha256Hex(raw)
  const filenameHash = await sha256Hex(new TextEncoder().encode(file.name))

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])

  // 12 bytes es el tamaño de nonce recomendado para GCM. Aleatorio por
  // documento: reutilizar un nonce con la misma clave rompe GCM por completo,
  // y como cada documento estrena clave, la colision es imposible.
  const iv = randomBytes(12)
  const payload = packPayload(
    { filename: file.name, mime: file.type || 'application/octet-stream', size: file.size },
    raw
  )

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload)
  )

  // IV por delante del ciphertext: no es secreto y guardarlo aparte solo crea la
  // posibilidad de perderlo y con ella el archivo.
  const bundle = new Uint8Array(iv.length + ciphertext.length)
  bundle.set(iv, 0)
  bundle.set(ciphertext, iv.length)

  const exported = new Uint8Array(await crypto.subtle.exportKey('raw', key))

  return {
    blob: new Blob([bundle], { type: 'application/octet-stream' }),
    dataKey: toBase64(exported),
    contentHash,
    filenameHash,
    plainSize: file.size,
  }
}

export async function decryptToFile(
  bundle: Uint8Array,
  dataKeyBase64: string
): Promise<{ blob: Blob; filename: string; mime: string }> {
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64(dataKeyBase64),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const iv = bundle.slice(0, 12)
  const ciphertext = bundle.slice(12)

  let plain: Uint8Array
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext))
  } catch {
    // GCM falla si el ciphertext fue alterado O si la clave es incorrecta, y no
    // distingue entre ambos casos. Se reporta como tal en vez de inventar una
    // causa.
    throw new Error('No se pudo descifrar: la clave es incorrecta o el archivo fue alterado')
  }

  const { header, file } = unpackPayload(plain)
  return { blob: new Blob([file], { type: header.mime }), filename: header.filename, mime: header.mime }
}

/* ------------------------------------------------ Envio a terceros -------- */

/**
 * Deriva una clave de envoltura a partir de la credencial de un solo uso.
 *
 * PBKDF2 con 600.000 iteraciones (recomendacion OWASP 2023 para SHA-256). La
 * credencial que genera esta consola tiene 32 bytes de entropia, asi que la
 * fuerza bruta es inviable de todos modos; el coste de derivacion protege el
 * caso en que un usuario decida escribir una credencial suya, mas debil.
 */
async function deriveKeyFromCredential(credential: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(credential),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Envuelve la clave de datos con la credencial. El servidor nunca ve la credencial. */
export async function wrapWithCredential(
  dataKeyBase64: string,
  credential: string
): Promise<{ wrappedKey: string; salt: string }> {
  const salt = randomBytes(16)
  const key = await deriveKeyFromCredential(credential, salt)
  const iv = randomBytes(12)

  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(dataKeyBase64)
    )
  )

  const bundle = new Uint8Array(iv.length + wrapped.length)
  bundle.set(iv, 0)
  bundle.set(wrapped, iv.length)

  return { wrappedKey: toBase64(bundle), salt: toBase64(salt) }
}

export async function unwrapWithCredential(
  wrappedKeyBase64: string,
  saltBase64: string,
  credential: string
): Promise<string> {
  const key = await deriveKeyFromCredential(credential, fromBase64(saltBase64))
  const bundle = fromBase64(wrappedKeyBase64)

  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bundle.slice(0, 12) },
      key,
      bundle.slice(12)
    )
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('Credencial incorrecta')
  }
}

/* ---------------------------------------------------------------- Hash ---- */

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
