import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Card } from '@/shared/components/ui'

/**
 * "Fortalece tu proteccion": la tarjeta de acciones del panel. Traduce el estado
 * de la organizacion en cosas que el administrador puede resolver AHORA, cada una
 * con su enlace directo. Es lo primero que se ve porque es lo primero que hay que
 * hacer; el resto del panel es diagnostico, esto es la lista de tareas.
 */
export type ProtectionItem = {
  /** `count` resaltado dentro del texto; se compone con `before`/`after`. */
  before: string
  count: number
  after: string
  href: string
  action: string
  /** Un item "resuelto" (count 0) se atenua en vez de ocultarse: ver que algo
   * esta en cero es informacion, no ausencia de informacion. */
  tone: 'critical' | 'warning' | 'ok'
}

export function ProtectionCard({ items }: { items: ProtectionItem[] }) {
  const todoOk = items.every((i) => i.count === 0)

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[minmax(0,20rem)_1fr]">
        {/* Lado izquierdo: el mensaje. */}
        <div className="flex flex-col items-center justify-center gap-3 border-b border-border bg-surface-muted px-6 py-8 text-center md:border-b-0 md:border-r">
          <ShieldCheck
            className={todoOk ? 'h-14 w-14 text-success' : 'h-14 w-14 text-primary'}
            aria-hidden
          />
          <p className="text-lg font-semibold tracking-tight">
            {todoOk ? 'Su seguridad esta al dia.' : 'Tome control de su seguridad.'}
          </p>
        </div>

        {/* Lado derecho: las acciones, una por fila. */}
        <ul className="divide-y divide-border">
          {items.map((item, index) => {
            const dim = item.count === 0
            return (
              <li
                key={index}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5"
              >
                <p className={dim ? 'text-sm text-muted-foreground' : 'text-sm text-foreground'}>
                  {item.before}{' '}
                  <span
                    className={
                      dim
                        ? 'font-semibold'
                        : item.tone === 'critical'
                          ? 'font-semibold text-critical'
                          : 'font-semibold text-warning'
                    }
                  >
                    {item.count}
                  </span>{' '}
                  {item.after}
                </p>
                {dim ? (
                  <span className="text-xs font-medium text-success">Resuelto</span>
                ) : (
                  <Link
                    href={item.href}
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    {item.action}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
