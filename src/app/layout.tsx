import type { Metadata, Viewport } from 'next'
import { ServiceWorkerRegister } from '@/shared/components/service-worker-register'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nortis — Consola de seguridad',
  description:
    'Monitoreo de endpoints, prevencion de fuga de informacion y cifrado gestionado.',
  applicationName: 'Nortis',
  manifest: '/manifest.webmanifest',
  // Una consola de administracion no tiene por que aparecer en buscadores.
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Nortis',
    // Barra de estado translucida + `viewport-fit=cover`: el fondo lavanda de la
    // app llega hasta arriba del todo en iOS. El contenido se aparta con las
    // utilidades `pt-safe`/`pb-safe`.
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#f2f0fb',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  // Se permite ampliar. Bloquear el zoom en una consola llena de rutas de
  // archivo y hashes deja sin salida a quien necesita acercarse para leerlos.
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
