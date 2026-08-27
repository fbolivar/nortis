import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import {
  PlaybooksManager,
  type PlaybookRule,
} from '@/features/playbooks/components/playbooks-manager'
import type { IncidentSeverity } from '@/shared/types/database'

export default async function PlaybooksSettingsPage() {
  const supabase = await createClient()
  const session = await getSessionContext()
  const canEdit = session?.role === 'owner' || session?.role === 'admin'

  const { data } = await supabase
    .from('playbook_rules')
    .select('id, enabled, name, min_severity, match_channel, action')
    .order('created_at', { ascending: true })

  const rules: PlaybookRule[] = (data ?? []).map((r) => ({
    id: r.id,
    enabled: r.enabled,
    name: r.name,
    min_severity: r.min_severity as IncidentSeverity,
    match_channel: r.match_channel,
    action: r.action,
  }))

  return (
    <>
      <PageHeader
        title="Respuesta automatica"
        description="Reglas que ejecutan una accion firmada cuando se abre un incidente que coincide"
      />
      <div className="page-body">
        <PlaybooksManager initial={rules} canEdit={canEdit} />
      </div>
    </>
  )
}
