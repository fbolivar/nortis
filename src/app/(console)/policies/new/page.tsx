import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { PolicyEditor } from '@/features/policies/components/policy-editor'
import { emptyPolicyConfig } from '@/shared/schemas/policy'

export default async function NewPolicyPage() {
  const supabase = await createClient()
  const session = await getSessionContext()

  // Crear politicas es potestad de owner/admin. RLS lo rechazaria de todas
  // formas, pero mostrar un editor que no puede guardar es peor experiencia que
  // no mostrarlo.
  if (session?.role !== 'owner' && session?.role !== 'admin') redirect('/policies')

  const { data: endpoints } = await supabase
    .from('endpoints')
    .select('id, hostname, assigned_profile_id')
    .order('hostname')

  return (
    <>
      <PageHeader
        title="Nuevo perfil de seguridad"
        description="Empieza sin restricciones: active solo lo que vaya a simular antes de desplegar"
      />
      <div className="page-body">
        <PolicyEditor
          profile={null}
          initialConfig={emptyPolicyConfig()}
          endpoints={endpoints ?? []}
          consentSigned={Boolean(session.organization?.monitoring_consent_signed_at)}
          canEdit
        />
      </div>
    </>
  )
}
