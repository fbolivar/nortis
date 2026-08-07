import { redirect } from 'next/navigation'
import { ConsoleShell } from '@/shared/components/console-shell'
import { getSessionContext } from '@/features/auth/services/session'

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

  return (
    <ConsoleShell
      organizationName={session.organization?.name ?? 'Organizacion'}
      email={session.email}
      role={session.role}
    >
      {children}
    </ConsoleShell>
  )
}
