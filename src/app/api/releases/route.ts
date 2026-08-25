import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'

/**
 * POST /api/releases
 *
 * Publica una version del agente y la marca como la actual. A partir de ahi,
 * /api/agent/version la anuncia y los agentes de toda la flota se actualizan
 * solos en su siguiente ciclo. Publicar una vez llega a todos los equipos.
 *
 * El MSI debe estar ya subido al bucket agent-dist (lo hace operaciones). Esta
 * ruta lo LEE, calcula su sha256, crea una URL firmada de larga duracion y
 * registra la version. El sha256 y la firma no se confian al que publica: se
 * derivan aqui del binario real.
 *
 * NO cuelga de /api/agent (esa superficie es publica): esto exige sesion de
 * admin con MFA. El middleware la protege por no empezar por /api/agent.
 */
const cuerpo = z.object({
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, 'La version debe ser N.N.N'),
  // Nombre del MSI dentro del bucket agent-dist.
  object_name: z.string().trim().min(1).max(255),
  notes: z.string().trim().max(2000).optional(),
})

// 10 anos: la URL firmada debe durar mas que la version. Cada publicacion crea
// la suya; una version retirada deja de anunciarse aunque su URL siga viva.
const VALIDEZ_URL_SEGUNDOS = 315_360_000

export async function POST(request: Request) {
  const session = await getSessionContext()
  if (!session) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }
  if (session.role !== 'owner' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Solo owner o admin pueden publicar versiones' }, { status: 403 })
  }
  if (!session.mfaSatisfied) {
    return NextResponse.json({ error: 'Se requiere segundo factor' }, { status: 403 })
  }

  const parsed = cuerpo.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Cuerpo invalido' }, { status: 400 })
  }
  const { version, object_name, notes } = parsed.data

  const supabase = await createClient()

  // Se descarga el MSI real y se calcula su hash: el que publica no dicta el
  // sha256, se deriva del binario. Un objeto que no existe da un 404 claro.
  const descarga = await supabase.storage.from('agent-dist').download(object_name)
  if (descarga.error || !descarga.data) {
    return NextResponse.json(
      { error: `No se encontro "${object_name}" en el bucket agent-dist. Subalo primero.` },
      { status: 404 }
    )
  }
  const bytes = new Uint8Array(await descarga.data.arrayBuffer())
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  const firma = await supabase.storage
    .from('agent-dist')
    .createSignedUrl(object_name, VALIDEZ_URL_SEGUNDOS)
  if (firma.error || !firma.data?.signedUrl) {
    return NextResponse.json(
      { error: `No se pudo firmar la URL de descarga: ${firma.error?.message ?? 'desconocido'}` },
      { status: 500 }
    )
  }
  // createSignedUrl puede devolver una ruta relativa; se absolutiza para que el
  // agente la use tal cual, sin conocer la base de Storage.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const downloadUrl = firma.data.signedUrl.startsWith('http')
    ? firma.data.signedUrl
    : `${base}/storage/v1${firma.data.signedUrl.startsWith('/') ? '' : '/'}${firma.data.signedUrl}`

  const { data: releaseId, error: rpcError } = await supabase.rpc('set_current_agent_release', {
    p_version: version,
    p_object_name: object_name,
    p_sha256: sha256,
    p_download_url: downloadUrl,
    p_size_bytes: bytes.byteLength,
    p_notes: notes,
  })
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 })
  }

  return NextResponse.json({ id: releaseId, version, sha256, size_bytes: bytes.byteLength })
}
