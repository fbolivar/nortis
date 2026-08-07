'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings', label: 'Organizacion' },
  { href: '/settings/users', label: 'Usuarios' },
  { href: '/settings/api-keys', label: 'Credenciales de agente' },
  { href: '/settings/audit', label: 'Auditoria' },
] as const

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-border px-6">
      {TABS.map(({ href, label }) => {
        // Comparacion exacta para /settings: startsWith haria que la pestaña
        // "Organizacion" quedara activa en todas las subrutas.
        const active = href === '/settings' ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              active
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
