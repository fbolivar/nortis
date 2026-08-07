'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FileSearch,
  LayoutDashboard,
  MonitorSmartphone,
  ShieldAlert,
  SlidersHorizontal,
  Lock,
  Settings,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Badge } from '@/shared/components/ui'
import type { AppRole } from '@/shared/types/database'

const NAV = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { href: '/endpoints', label: 'Equipos', icon: MonitorSmartphone },
  { href: '/activity', label: 'Trazabilidad', icon: FileSearch },
  { href: '/incidents', label: 'Incidentes', icon: ShieldAlert },
  { href: '/policies', label: 'Politicas', icon: SlidersHorizontal },
  { href: '/vault', label: 'Cifrado', icon: Lock },
  { href: '/settings', label: 'Administracion', icon: Settings },
] as const

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  viewer: 'Solo lectura',
}

export function ConsoleShell({
  children,
  organizationName,
  email,
  role,
}: {
  children: React.ReactNode
  organizationName: string
  email: string
  role: AppRole
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold tracking-tight">NORTIS</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={organizationName}>
            {organizationName}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          <p className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <Badge tone={role === 'viewer' ? 'neutral' : 'info'}>{ROLE_LABEL[role]}</Badge>
            <button
              onClick={signOut}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Salir
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}

/** Encabezado estandar de pagina. Titulo + contexto + acciones a la derecha. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
