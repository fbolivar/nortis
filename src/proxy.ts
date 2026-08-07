import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Todo excepto assets estaticos. El matcher es una lista de EXCLUSION a
     * proposito: si fuera una lista de inclusion, cada ruta nueva de la consola
     * naceria desprotegida hasta que alguien se acordara de añadirla.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
