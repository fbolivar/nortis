import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { AppRole, ConsoleUser, Organization } from '@/shared/types/database'

export interface SessionContext {
  userId: string
  email: string
  profile: ConsoleUser | null
  organization: Organization | null
  role: AppRole | null
  /** Permisos granulares concedidos al usuario (ademas de su rol). */
  permissions: string[]
  /** Nivel alcanzado en ESTA sesion. */
  currentLevel: 'aal1' | 'aal2' | null
  /** Nivel que el usuario podria alcanzar (aal2 si tiene un factor verificado). */
  nextLevel: 'aal1' | 'aal2' | null
  /** Su rol exige segundo factor. */
  mfaRequired: boolean
  /** Cumple el nivel exigido. Si es false, la base le negara todo dato del tenant. */
  mfaSatisfied: boolean
}

/**
 * Contexto de autorizacion para Server Components.
 *
 * Deliberadamente NO decide redirecciones: solo describe el estado. Quien
 * redirige es el layout, en un unico sitio. Repartir esa decision entre varias
 * paginas es como se acaban colando rutas que olvidan una de las condiciones.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: aal }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  // La organizacion se consulta aparte y no con un join: si el usuario esta en
  // aal1, RLS le niega la fila de organizations y el join haria fallar tambien
  // la lectura del perfil, que si tiene permitida.
  let organization: Organization | null = null
  if (profile) {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', profile.organization_id)
      .maybeSingle()
    organization = data ?? null
  }

  const role = profile?.role ?? null
  const mfaRequired = role === 'owner' || role === 'admin'
  const currentLevel = (aal?.currentLevel as 'aal1' | 'aal2' | null) ?? null

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? '',
    profile: profile ?? null,
    organization,
    role,
    permissions: (profile as { permissions?: string[] } | null)?.permissions ?? [],
    currentLevel,
    nextLevel: (aal?.nextLevel as 'aal1' | 'aal2' | null) ?? null,
    mfaRequired,
    mfaSatisfied: !mfaRequired || currentLevel === 'aal2',
  }
}

/**
 * true si la sesion puede ejercer una capacidad: es admin/owner (que tienen
 * todo) o tiene el permiso granular concedido. Refleja exactamente la funcion
 * has_permission de la base, para que la UI muestre lo mismo que el servidor
 * permite.
 */
export function can(
  session: Pick<SessionContext, 'role' | 'permissions'> | null,
  perm: string,
): boolean {
  if (!session) return false
  return session.role === 'owner' || session.role === 'admin' || session.permissions.includes(perm)
}
