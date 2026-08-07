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
 * En desarrollo no basta con NO registrarlo: hay que DESREGISTRAR el que pudiera
 * haber quedado de antes.
 *
 * El registro es por origen y persiste en el navegador. Basta con haber probado
 * una vez la instalacion de la PWA —que exige servir un build de produccion en
 * localhost— para que el worker quede activo en `localhost:3000` para siempre, y
 * siga interceptando cuando se vuelve a `npm run dev`.
 *
 * El daño concreto: `/_next/static/` se sirve cache-first y sin revalidar. En
 * produccion es correcto, porque esas rutas llevan hash de contenido; en
 * desarrollo los nombres de chunk son estables y su contenido cambia en cada
 * edicion, asi que el navegador se queda con el JS viejo indefinidamente
 * mientras el servidor renderiza HTML nuevo. El sintoma es un error de
 * hidratacion que señala un componente cuyo codigo es correcto, y que sobrevive
 * a borrar .next y reiniciar el servidor — porque la copia envenenada esta en
 * CacheStorage, no en el proyecto.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      void purgeInDevelopment()
      return
    }

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

/** Marca de la recarga unica. Evita el bucle si la purga no surte efecto. */
const RELOAD_FLAG = 'nortis:sw-purgado'

/**
 * Desregistra el worker heredado y tira sus caches.
 *
 * Solo se borran las caches con el prefijo de Nortis: `caches.keys()` devuelve
 * las de TODO el origen, y en localhost conviven las de otros proyectos.
 *
 * La recarga es necesaria porque el documento ya en pantalla se cargo con los
 * chunks envenenados; desregistrar no los sustituye. Va detras de una marca en
 * sessionStorage para que, si por lo que sea la purga no bastara, la pagina no
 * entre en un bucle de recargas.
 */
async function purgeInDevelopment() {
  const registrations = await navigator.serviceWorker.getRegistrations()

  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('nortis-')).map((k) => caches.delete(k)))
  }

  if (registrations.length === 0) return

  await Promise.all(registrations.map((registration) => registration.unregister()))

  if (!sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, '1')
    window.location.reload()
  }
}
