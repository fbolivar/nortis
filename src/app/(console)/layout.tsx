import { redirect } from 'next/navigation'
import { ConsoleShell } from '@/shared/components/console-shell'
import { getSessionContext } from '@/features/auth/services/session'
import { createClient } from '@/lib/supabase/server'

/**
 * Unico punto de autorizacion de la consola.
 *
 * Las tres condiciones se evaluan aqui y solo aqui. Repartirlas por pagina es
 * como se acaban colando rutas que olvidan una: la ruta nueva hereda el gate por
 * el simple hecho de vivir dentro de este grupo.
 *
 * Ojo: esto es defensa en profundidad, no el control primario. Aunque alguien
 * lograra saltarse este layout, RLS seguiria negando los datos — un owner en
 * aal1 no lee nada del tenant. La UI evita el callejon sin salida; la base
 * impone la regla.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext()

  if (!session) redirect('/login')
  if (!session.profile || !session.role) redirect('/onboarding')
  if (!session.mfaSatisfied) redirect('/mfa')

  // Incidentes abiertos, para el badge de navegacion (como el contador de
  // Insights de una consola DLP). RLS ya lo acota por organizacion y por sede.
  const supabase = await createClient()
  const { count: incidentCount } = await supabase
    .from('dlp_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')

  return (
    <ConsoleShell
      organizationName={session.organization?.name ?? 'Organizacion'}
      email={session.email}
      role={session.role}
      incidentCount={incidentCount ?? 0}
    >
      {children}
    </ConsoleShell>
  )
}
