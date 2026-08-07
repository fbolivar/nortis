'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Evento propietario de Chromium. No esta en lib.dom, asi que se declara aqui en
 * lugar de castear a `any` cada vez que se toca.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

/**
 * Boton de instalacion de la PWA.
 *
 * Solo se renderiza cuando el navegador ha ofrecido `beforeinstallprompt`, es
 * decir cuando la instalacion es realmente posible y la app no esta instalada
 * ya. Mostrar un boton fijo seria peor que no mostrarlo: en Safari de escritorio
 * o en una ventana ya instalada no habria nada que hacer al pulsarlo, y un
 * control que no responde erosiona la confianza en toda la consola.
 *
 * iOS no expone el evento —la instalacion pasa por "Compartir > Añadir a
 * pantalla de inicio"— de modo que ahi el boton simplemente no aparece.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      // Sin preventDefault, Chrome muestra su propio mini-infobar y el evento se
      // consume antes de que podamos reutilizarlo desde el boton.
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }

    function onInstalled() {
      setPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!prompt) return null

  return (
    <button
      onClick={async () => {
        await prompt.prompt()
        await prompt.userChoice
        // El evento es de un solo uso: aceptada o descartada, ya no sirve.
        setPrompt(null)
      }}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-card transition-colors hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      <Download className="h-4 w-4" aria-hidden />
      Instalar app
    </button>
  )
}
