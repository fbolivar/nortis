import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { ClassificationManager } from '@/features/classification/components/classification-manager'
import type { Classification } from '@/features/classification/lib/classify'

/**
 * Clasificacion de datos (Fase A: por patron). El administrador define que
 * cuenta como codigo fuente, financiero, datos personales, etc., por extension y
 * palabras clave de la ruta. Esas etiquetas alimentan el panel.
 */
export default async function ClassificationPage() {
  const session = await getSessionContext()
  if (!session?.organization) redirect('/login')

  const canEdit = session.role === 'owner' || session.role === 'admin'
  const supabase = await createClient()
  const { data } = await supabase
    .from('data_classifications')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <>
      <PageHeader
        title="Clasificacion de datos"
        description="Etiqueta los datos por clase para verlos agrupados en el panel"
      />
      <div className="page-body">
        <ClassificationManager
          organizationId={session.organization.id}
          classifications={(data ?? []) as Classification[]}
          canEdit={canEdit}
        />
      </div>
    </>
  )
}
