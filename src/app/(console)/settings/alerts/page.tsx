import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { AlertSettingsForm } from '@/features/alerts/components/alert-settings-form'
import type { IncidentSeverity } from '@/shared/types/database'

export default async function AlertsSettingsPage() {
  const supabase = await createClient()
  const session = await getSessionContext()
  const canEdit = session?.role === 'owner' || session?.role === 'admin'

  // RLS acota la lectura a la organizacion del usuario; puede no existir fila aun.
  const { data } = await supabase
    .from('alert_settings')
    .select('enabled, recipients, min_severity')
    .maybeSingle()

  return (
    <AlertSettingsForm
      initial={{
        enabled: data?.enabled ?? false,
        recipients: data?.recipients ?? [],
        min_severity: (data?.min_severity as IncidentSeverity) ?? 'high',
      }}
      canEdit={canEdit}
    />
  )
}
