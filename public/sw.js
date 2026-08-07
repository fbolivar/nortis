/*
 * Service worker de la consola Nortis.
 *
 * REGLA QUE GOBIERNA TODO ESTE ARCHIVO: NUNCA SE CACHEA CONTENIDO AUTENTICADO.
 *
 * Nortis muestra telemetria de endpoints, incidentes de fuga de informacion y
 * documentos cifrados de una organizacion concreta. Guardar una respuesta de
 * navegacion o de API en CacheStorage la deja en disco sin cifrar y sin fecha de
 * caducidad ligada a la sesion: quien abra el navegador despues de un cierre de
 * sesion —o el siguiente usuario de un equipo compartido— podria leerla. Por eso
 * el unico contenido que entra en cache es estatico, hasheado y publico: el
 * bundle de la aplicacion y los iconos.
 *
 * Existe ademas por un motivo funcional: sin un service worker con manejador de
 * `fetch`, Chromium no considera la aplicacion instalable y no dispara
 * `beforeinstallprompt`.
 */

const VERSION = 'nortis-v1'
const STATIC_CACHE = `${VERSION}-static`
const SHELL_CACHE = `${VERSION}-shell`

const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      // Se activa sin esperar a que se cierren las pestañas viejas. Es seguro
      // porque no hay estado compartido entre versiones del worker.
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

/** Assets inmutables con hash en el nombre: cachearlos no expone nada. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico'
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Solo GET de mismo origen. Un POST no se cachea nunca, y las llamadas a
  // Supabase son de otro origen: deben ir a la red tal cual, sin que el worker
  // se interponga en la renovacion de tokens.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            // Solo se guardan respuestas completas y validas: una respuesta
            // parcial (206) o un error cacheado deja la app rota hasta el
            // siguiente despliegue.
            if (response.ok && response.status === 200) {
              const copy = response.clone()
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          })
      )
    )
    return
  }

  if (request.mode === 'navigate') {
    // Solo red. La respuesta NO se guarda: es HTML del tenant autenticado.
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((hit) => hit || Response.error()))
    )
    return
  }

  // Todo lo demas (rutas de API, datos) pasa a la red sin intervencion.
})
