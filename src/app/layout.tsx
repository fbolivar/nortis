import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nortis — Consola de seguridad',
  description:
    'Monitoreo de endpoints, prevencion de fuga de informacion y cifrado gestionado.',
  // Una consola de administracion no tiene por que aparecer en buscadores.
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
