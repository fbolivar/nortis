import type { MetadataRoute } from 'next'

/**
 * Manifiesto de la PWA.
 *
 * `start_url` apunta a /dashboard y no a /: la raiz solo redirige, y arrancar la
 * app instalada en una redireccion añade un salto visible cada vez que se abre.
 * Si no hay sesion, la propia consola manda a /login.
 *
 * `display: standalone` y no `fullscreen`: esta consola se consulta de un
 * vistazo entre otras tareas, y ocultar la barra de estado quitaria la hora y la
 * bateria, que el analista mira tanto como el panel.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nortis — Consola de seguridad',
    short_name: 'Nortis',
    description:
      'Monitoreo de endpoints, prevencion de fuga de informacion y cifrado gestionado.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    /*
     * Ambos son el lienzo de la marca (`--background`, el azul-gris derivado del
     * azul marino del logo) y no el azul marino puro.
     *
     * `background_color` pinta la pantalla de arranque: tiene que ser el color
     * que el usuario vera medio segundo despues, o el arranque da un fogonazo.
     * `theme_color` tiñe la barra de estado en Android: con el azul marino, la
     * barra quedaria oscura sobre una app clara y se leeria como un recorte.
     * El isotipo azul del icono ya aporta la marca sobre este lienzo.
     */
    background_color: '#f2f4f8',
    theme_color: '#f2f4f8',
    lang: 'es',
    dir: 'ltr',
    categories: ['business', 'productivity', 'security'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // El icono enmascarable es un archivo aparte con el isotipo mas pequeño:
      // si se declarara el mismo con `purpose: 'maskable'`, Android recortaria
      // las puntas de la rosa de los vientos al aplicar su forma.
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Incidentes', url: '/incidents' },
      { name: 'Equipos', url: '/endpoints' },
    ],
  }
}
