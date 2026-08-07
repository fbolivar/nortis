'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Dialogo modal.
 *
 * VIVE EN SU PROPIO MODULO, y no junto al resto de primitivos en `ui/index.tsx`,
 * porque es el unico que usa hooks.
 *
 * `ui/index.tsx` no lleva directiva: lo importan Server Components (`Callout`,
 * `Card`) y Client Components por igual, asi que el bundler lo compila en los
 * dos grafos. Un componente con `useRef`/`useEffect` ahi dentro es una trampa:
 * resuelve de forma inconsistente entre recompilaciones —el sintoma es
 * "Element type is invalid ... got: undefined" en el sitio donde se usa, que no
 * apunta a la causa— y falla del todo si alguien lo renderiza desde un Server
 * Component. Con `'use client'` propio, el modulo es cliente sin ambiguedad.
 *
 * Se apoya en `<dialog>` nativo y no en un div con `position: fixed`. El
 * elemento nativo trae de fabrica tres cosas que una reimplementacion siempre
 * acaba haciendo a medias: el foco queda atrapado dentro del dialogo, el resto
 * de la pagina se marca inerte para los lectores de pantalla, y Escape cierra.
 * En un formulario que reparte privilegios, "el tabulador se escapa detras del
 * velo" no es un detalle de pulido.
 *
 * `showModal()` se llama desde un efecto y no en el render porque es una
 * operacion imperativa sobre el DOM: en el render, React todavia no ha montado
 * el nodo.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      // `cancel` cubre Escape; `close` cubre cualquier cierre nativo. Sin
      // sincronizar el estado de React, reabrir el dialogo despues de un Escape
      // no vuelve a funcionar: para React seguiria abierto.
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="modal-title"
      className={cn(
        'w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border/60 bg-surface p-0 text-foreground shadow-lifted',
        'backdrop:bg-ink/50 backdrop:backdrop-blur-sm',
        'motion-safe:animate-fade-in'
      )}
    >
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 id="modal-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </dialog>
  )
}
