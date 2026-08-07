'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker que hace instalable la consola.
 *
 * Se registra despues de `load` a proposito: durante el arranque el navegador ya
 * esta descargando el bundle de la aplicacion, y adelantar el registro compite
 * por el mismo ancho de banda sin ganar nada — el service worker no atiende la
 * navegacion que lo instalo.
 *
 * En desarrollo no se registra: un service worker activo sirviendo assets
 * cacheados junto a HMR produce recargas que muestran codigo viejo, y se
 * diagnostica como un bug del codigo que no existe.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    function register() {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Un fallo de registro degrada la PWA a web normal. No hay nada que el
        // usuario pueda hacer al respecto, asi que no se le interrumpe.
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
