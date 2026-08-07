import { PageHeader } from '@/shared/components/console-shell'
import { EmptyState } from '@/shared/components/ui'

/**
 * Placeholder de modulo aun no construido.
 *
 * Existe para que la navegacion no lleve a un 404: un enlace roto en una consola
 * de seguridad se lee como "el producto esta caido", no como "esto falta".
 * Cada pantalla dice explicitamente que fase la trae.
 */
export function ModulePending({
  title,
  description,
  phase,
}: {
  title: string
  description: string
  phase: string
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState title="Modulo en construccion" description={phase} />
        </div>
      </div>
    </>
  )
}
