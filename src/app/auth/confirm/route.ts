import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/confirm
 *
 * Punto de aterrizaje de los enlaces que Supabase envia por correo
 * (recuperacion de contraseña, confirmacion de cuenta). Canjea lo que venga en
 * la URL por una sesion y encamina al usuario.
 *
 * ATIENDE LAS DOS FORMAS DE ENLACE A PROPOSITO
 *
 * `@supabase/ssr` usa PKCE, y con PKCE el enlace vuelve con `?code=…`, que se
 * canjea con `exchangeCodeForSession`. Pero la plantilla de correo de Supabase
 * se puede cambiar a `{{ .TokenHash }}`, y entonces vuelve con
 * `?token_hash=…&type=recovery`, que se canjea con `verifyOtp`.
 *
 * Soportar solo una de las dos ata el producto a una configuracion concreta del
 * panel de Supabase que nadie recuerda haber hecho: el sintoma seria un enlace
 * de recuperacion que caduca "sin motivo" justo cuando alguien toca la
 * plantilla. Ambas ramas son cuatro lineas.
 *
 * LO QUE ESTE HANDLER NO HACE: fijar la contraseña. Solo deja al usuario con
 * sesion viva y lo manda a /update-password. Separarlo importa porque el enlace
 * viaja por correo —un canal que no controlamos— y un enlace que ya contuviera
 * la contraseña nueva seria un secreto en el buzon de alguien para siempre.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  /*
   * `next` se valida contra redireccion abierta. Sin esto, un enlace
   * /auth/confirm?next=https://sitio-falso llevaria al usuario —ya autenticado—
   * a un dominio ajeno, y el correo vendria de verdad desde Supabase: seria una
   * pagina de phishing con procedencia legitima.
   */
  const rawNext = url.searchParams.get('next') ?? '/update-password'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/update-password'

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  }

  /*
   * No se distingue "enlace caducado" de "enlace ya usado" ni de "falta el
   * codigo": los tres se resuelven igual —pedir otro enlace— y separarlos solo
   * le diria a quien prueba enlaces ajenos cual de ellos existio.
   */
  return NextResponse.redirect(new URL('/login?recuperacion=invalida', url.origin))
}
