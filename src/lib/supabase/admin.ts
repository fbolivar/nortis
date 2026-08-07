import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database'

/**
 * Cliente con service_role: SALTA TODO EL RLS.
 *
 * `import 'server-only'` hace que el build FALLE si alguien lo importa desde un
 * Client Component. Es la unica proteccion real contra el peor error posible en
 * este producto — filtrar al navegador la clave que da acceso a la telemetria de
 * todos los tenants.
 *
 * Reglas de uso:
 *   - Solo en Route Handlers de /api/agent (ingesta autenticada por API key).
 *   - Nunca para operaciones de la consola: ahi el usuario tiene sesion y RLS
 *     debe aplicarse. Si una funcion de consola "necesita" service_role, casi
 *     siempre significa que falta una politica o un RPC, no que haga falta el
 *     bypass.
 *
 * Se construye de forma perezosa: importar este modulo no debe reventar el
 * arranque mientras la variable no este configurada.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no esta configurada. Requerida solo por la superficie /api/agent.'
    )
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
