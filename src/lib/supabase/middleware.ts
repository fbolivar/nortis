import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/shared/types/database'

/**
 * Rutas que no exigen sesion de usuario. Todo lo demas queda protegido por
 * defecto.
 *
 * `/api/agent` NO es una excepcion al control de acceso, es una superficie con
 * OTRO control: el agente no tiene sesion, se autentica con la API key de su
 * tenant en cada peticion y esa credencial se valida dentro de la base. Sin esta
 * entrada, el proxy redirige al agente a /login y la ingesta entera queda
 * inalcanzable — un fallo que solo aparece probando por HTTP, porque llamando a
 * los RPC directamente el proxy ni siquiera interviene.
 */
const PUBLIC_PATHS = ['/login', '/signup', '/auth', '/share', '/invite', '/api/agent']

function isPublic(pathname: string) {
  return pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

/**
 * Refresca la sesion en cada request y bloquea el acceso anonimo.
 *
 * El middleware solo responde "¿hay sesion?". La autorizacion real —rol, tenant,
 * nivel de MFA— se resuelve en el layout de la consola, que es un Server
 * Component y puede consultar la base sin penalizar cada request de assets.
 * Duplicar ahi esas comprobaciones ademas invitaria a que las dos copias se
 * desincronicen, y la version equivocada seria la que decide el acceso.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() y no getSession(): getSession lee la cookie sin validarla contra el
  // servidor de Auth, asi que una cookie manipulada pasaria el control. En un
  // producto de seguridad esa diferencia no es un detalle.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
