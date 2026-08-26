import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { taskSigningAvailable } from '@/shared/lib/agent-signing'
import { PageHeader } from '@/shared/components/console-shell'
import { Callout } from '@/shared/components/ui'
import { TaskIssuer } from '@/features/tasks/components/task-issuer'
import { TaskList, type TaskRow } from '@/features/tasks/components/task-list'

/**
 * Despliegue: emitir tareas de ejecucion remota (instalar un MSI, colocar un
 * archivo, reiniciar) y ver su estado. Solo owner/admin puede emitir; la consola
 * firma cada tarea en el servidor y el agente la verifica antes de ejecutarla.
 */
export default async function TasksPage() {
  const supabase = await createClient()
  const session = await getSessionContext()
  const canIssue = session?.role === 'owner' || session?.role === 'admin'

  const [{ data: endpoints }, { data: tasks }] = await Promise.all([
    supabase
      .from('endpoints')
      .select('id, hostname, last_logged_user, status')
      .order('hostname'),
    supabase
      .from('agent_tasks')
      .select(
        'id, endpoint_id, kind, status, exit_code, output, error, created_at, completed_at, not_before, endpoints(hostname)',
      )
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  const signingReady = taskSigningAvailable()
  const rows = (tasks ?? []) as unknown as TaskRow[]

  return (
    <>
      <PageHeader
        title="Despliegue"
        description="Instalar software, colocar archivos o reiniciar equipos de forma remota"
      />

      <div className="page-body space-y-4">
        {!signingReady ? (
          <Callout tone="warning" title="Firma de tareas no configurada">
            Falta la clave privada de la consola (<strong>AGENT_SIGNING_PRIVKEY</strong>). Sin
            ella no se pueden firmar tareas y el agente rechazaria cualquiera. Configure la
            variable de entorno con el contenido de <strong>console_privkey.pem</strong> y vuelva
            a desplegar.
          </Callout>
        ) : null}

        <TaskIssuer
          endpoints={endpoints ?? []}
          canIssue={canIssue}
          signingReady={signingReady}
        />

        <TaskList rows={rows} />
      </div>
    </>
  )
}
