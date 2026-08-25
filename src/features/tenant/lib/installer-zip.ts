import 'server-only'

/**
 * Escritor de ZIP minimo, en modo "store" (sin compresion).
 *
 * Se escribe a mano en vez de traer una libreria a proposito: es una decena de
 * lineas de un formato estable desde 1989, y en un producto de seguridad cada
 * dependencia nueva es superficie de suministro que auditar. Comprimir no aporta
 * nada aqui —el MSI ya viene comprimido y la clave publica pesa nada—, asi que
 * "store" es la eleccion correcta, no un atajo.
 *
 * El formato producido lo abren el Explorador de Windows, PowerShell
 * (`Expand-Archive`) y cualquier descompresor estandar.
 */

export interface ArchivoZip {
  /** Nombre dentro del ZIP. ASCII; se guarda tal cual. */
  nombre: string
  datos: Uint8Array
}

// Tabla CRC-32 (polinomio IEEE 802.3), la que exige el formato ZIP. Se calcula
// una vez al cargar el modulo.
const tablaCrc = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[n] = c >>> 0
  }
  return t
})()

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) {
    c = tablaCrc[(c ^ datos[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/**
 * crearZip serializa los archivos en un unico buffer ZIP.
 *
 * Estructura: por cada archivo, una cabecera local seguida de sus bytes; al
 * final, el directorio central (una entrada por archivo) y el registro de cierre.
 * Todo en little-endian, como manda el formato.
 */
export function crearZip(archivos: ArchivoZip[]): Uint8Array {
  const codificador = new TextEncoder()
  const trozos: Uint8Array[] = []
  let offset = 0

  interface Central {
    nombre: Uint8Array
    crc: number
    tam: number
    offset: number
  }
  const centrales: Central[] = []

  const u16 = (v: number) => {
    const b = new Uint8Array(2)
    new DataView(b.buffer).setUint16(0, v, true)
    return b
  }
  const u32 = (v: number) => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, v >>> 0, true)
    return b
  }
  const push = (b: Uint8Array) => {
    trozos.push(b)
    offset += b.length
  }

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre)
    const crc = crc32(archivo.datos)
    const tam = archivo.datos.length
    const offsetLocal = offset

    // Cabecera local (0x04034b50). Sin descriptor de datos: crc y tamano se
    // conocen aqui mismo porque no se comprime, asi que van en la cabecera.
    push(u32(0x04034b50))
    push(u16(20)) // version necesaria
    push(u16(0)) // banderas
    push(u16(0)) // metodo: 0 = store
    push(u16(0)) // hora (fija)
    push(u16(0x21)) // fecha (fija: 1980-01-01, valida y reproducible)
    push(u32(crc))
    push(u32(tam)) // comprimido
    push(u32(tam)) // sin comprimir
    push(u16(nombre.length))
    push(u16(0)) // extra
    push(nombre)
    push(archivo.datos)

    centrales.push({ nombre, crc, tam, offset: offsetLocal })
  }

  const inicioCentral = offset

  for (const c of centrales) {
    // Cabecera de directorio central (0x02014b50).
    push(u32(0x02014b50))
    push(u16(20)) // version que creo
    push(u16(20)) // version necesaria
    push(u16(0)) // banderas
    push(u16(0)) // metodo
    push(u16(0)) // hora
    push(u16(0x21)) // fecha
    push(u32(c.crc))
    push(u32(c.tam))
    push(u32(c.tam))
    push(u16(c.nombre.length))
    push(u16(0)) // extra
    push(u16(0)) // comentario
    push(u16(0)) // disco
    push(u16(0)) // atributos internos
    push(u32(0)) // atributos externos
    push(u32(c.offset))
    push(c.nombre)
  }

  const tamCentral = offset - inicioCentral

  // Registro de fin de directorio central (0x06054b50).
  push(u32(0x06054b50))
  push(u16(0)) // disco
  push(u16(0)) // disco donde empieza el central
  push(u16(centrales.length))
  push(u16(centrales.length))
  push(u32(tamCentral))
  push(u32(inicioCentral))
  push(u16(0)) // comentario

  const total = trozos.reduce((n, t) => n + t.length, 0)
  const salida = new Uint8Array(total)
  let p = 0
  for (const t of trozos) {
    salida.set(t, p)
    p += t.length
  }
  return salida
}
