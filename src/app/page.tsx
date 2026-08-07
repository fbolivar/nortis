import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * La raiz no tiene contenido propio: Nortis es una consola, no un sitio publico.
 * La landing comercial vive en otro dominio.
 */
export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? '/dashboard' : '/login')
}
