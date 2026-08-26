import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/screenshots/[id]
 *
 * Sirve una captura como PNG. Usa la sesion del usuario (cookies): la RLS de
 * `screenshots` acota lo que puede leer a su organizacion y sede, asi que un
 * id de otro tenant devuelve 404 sin filtrar si existe.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('id invalido', { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_screenshot', { p_id: id })
  if (error || !data) {
    return new NextResponse('no encontrada', { status: 404 })
  }

  const bytes = Buffer.from(data as string, 'base64')
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Privado y de corta vida: es contenido sensible, no se cachea en proxies.
      'Cache-Control': 'private, max-age=60',
    },
  })
}
