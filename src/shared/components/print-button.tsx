'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/shared/components/ui'

/** Boton que manda la pagina a imprimir (o guardar como PDF). Se oculta al imprimir. */
export function PrintButton({ label = 'Imprimir / PDF' }: { label?: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer className="mr-1.5 h-4 w-4" aria-hidden />
      {label}
    </Button>
  )
}
