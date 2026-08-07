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
    /*
     * `sw.js` y `manifest.webmanifest` se excluyen por nombre exacto y no por
     * extension: son assets publicos de la PWA, no llevan datos de ningun
     * tenant, y el service worker debe poder actualizarse aunque la sesion haya
     * caducado — si no, un usuario con la app instalada se queda con la version
     * vieja del worker hasta que vuelva a iniciar sesion.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|offline\\.html$|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
