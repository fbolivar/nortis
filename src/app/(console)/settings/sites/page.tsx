import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { SitesManager } from '@/features/sites/components/sites-manager'

/**
 * Gestion de sedes. Fase 1: organizar equipos por sede (aun sin delegacion ni
 * aislamiento por RLS, que llegan en la Fase 2). Central: owner/admin.
 */
export default async function SitesSettingsPage() {
  const session = await getSessionContext()
  if (!session?.organization) redirect('/login')

  const canEdit = session.role === 'owner' || session.role === 'admin'
  const supabase = await createClient()

  const [{ data: sites }, { data: endpoints }] = await Promise.all([
    supabase.from('sites').select('id, name').order('name'),
    supabase.from('endpoints').select('id, hostname, site_id').order('hostname'),
  ])

  return (
    <SitesManager
      organizationId={session.organization.id}
      sites={sites ?? []}
      endpoints={endpoints ?? []}
      canEdit={canEdit}
    />
  )
}
