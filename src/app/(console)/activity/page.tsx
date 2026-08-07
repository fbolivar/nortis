import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/shared/components/console-shell'
import { FileTrace } from '@/features/telemetry/components/file-trace'

export default async function ActivityPage() {
  const supabase = await createClient()

  const { data: endpoints } = await supabase
    .from('endpoints')
    .select('id, hostname')
    .order('hostname')

  return (
    <>
      <PageHeader
        title="Trazabilidad"
        description="Quien creo, modifico o elimino cada archivo, y desde que equipo"
      />
      <div className="page-body">
        <FileTrace endpoints={endpoints ?? []} />
      </div>
    </>
  )
}
