'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings', label: 'Organizacion' },
  { href: '/settings/users', label: 'Usuarios' },
  { href: '/settings/sites', label: 'Sedes' },
  { href: '/settings/api-keys', label: 'Credenciales de agente' },
  { href: '/settings/alerts', label: 'Alertas' },
  { href: '/settings/exceptions', label: 'Excepciones' },
  { href: '/settings/playbooks', label: 'Respuesta automatica' },
  { href: '/settings/audit', label: 'Auditoria' },
] as const

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <div className="shell-container pb-6">
      {/*
        Scroll horizontal en movil en vez de envolver a dos lineas: cuatro
        pestañas apiladas empujan el contenido fuera de la primera pantalla, y
        el usuario deja de ver que hay debajo de la que acaba de elegir.
      */}
      <nav
        aria-label="Secciones de administracion"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Fondo `muted` y no `surface`: la barra vive dentro de la tarjeta
            blanca de la aplicacion, y una pastilla blanca sobre blanco no se
            distingue del lienzo. */}
        <div className="flex gap-1 rounded-full bg-muted p-1.5">
          {TABS.map(({ href, label }) => {
            // Comparacion exacta para /settings: startsWith haria que la pestaña
            // "Organizacion" quedara activa en todas las subrutas.
            const active = href === '/settings' ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors',
                  active
                    ? 'bg-ink font-medium text-ink-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
