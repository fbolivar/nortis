'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  FileSearch,
  LayoutDashboard,
  Menu,
  MonitorSmartphone,
  Boxes,
  ShieldAlert,
  SlidersHorizontal,
  Lock,
  RefreshCw,
  FileBarChart,
  ShieldCheck,
  Rocket,
  Search,
  Tags,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Badge } from '@/shared/components/ui'
import { InstallAppButton } from '@/shared/components/install-app-button'
import type { AppRole } from '@/shared/types/database'

/**
 * Navegacion agrupada por fase de trabajo, como una consola DLP madura: primero
 * lo que DETECTA (panel, incidentes, trazas, parque), luego lo que RESPONDE
 * (politicas, cifrado, despliegue) y por ultimo lo que se GESTIONA
 * (actualizaciones, administracion). El agrupado le da al menu un mapa mental en
 * vez de una lista plana de nueve entradas.
 */
const NAV_GROUPS = [
  {
    title: 'Detectar',
    items: [
      { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
      { href: '/incidents', label: 'Incidentes', icon: ShieldAlert },
      { href: '/activity', label: 'Trazabilidad', icon: FileSearch },
      { href: '/endpoints', label: 'Equipos', icon: MonitorSmartphone },
      { href: '/inventory', label: 'Inventario', icon: Boxes },
    ],
  },
  {
    title: 'Responder',
    items: [
      { href: '/policies', label: 'Politicas', icon: SlidersHorizontal },
      { href: '/classification', label: 'Clasificacion', icon: Tags },
      { href: '/vault', label: 'Cifrado', icon: Lock },
      { href: '/tasks', label: 'Despliegue', icon: Rocket },
    ],
  },
  {
    title: 'Gestionar',
    items: [
      { href: '/reports', label: 'Reportes', icon: FileBarChart },
      { href: '/reports/compliance', label: 'Cumplimiento', icon: ShieldCheck },
      { href: '/updates', label: 'Actualizaciones', icon: RefreshCw },
      { href: '/settings', label: 'Administracion', icon: Settings },
    ],
  },
] as const

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  viewer: 'Solo lectura',
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Iniciales del correo. Solo decoran el avatar: el correo real vive en el menu. */
function initials(email: string) {
  const name = email.split('@')[0] ?? ''
  const parts = name.split(/[._-]+/).filter(Boolean)
  const raw = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)
  return (raw || '?').toUpperCase()
}

/**
 * Marca dentro de la barra lateral oscura. Se usa el lockup CLARO porque el
 * fondo es tinta (#191919): el lockup oscuro no existiria sobre el.
 */
function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-lg"
      aria-label="Nortis, ir al panel"
    >
      <Image
        src="/brand/logo-claro.png"
        alt=""
        width={960}
        height={257}
        priority
        sizes="150px"
        className="h-8 w-auto shrink-0"
      />
    </Link>
  )
}

/** Lista de navegacion vertical, agrupada. Compartida entre barra lateral y panel movil. */
function NavList({
  pathname,
  incidentCount = 0,
  onNavigate,
}: {
  pathname: string
  /** Incidentes abiertos, para el badge de la entrada "Incidentes". */
  incidentCount?: number
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Navegacion principal" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-muted/70">
            {group.title}
          </p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href)
            const badge = href === '/incidents' && incidentCount > 0 ? incidentCount : null
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                  active
                    ? 'bg-primary text-primary-foreground shadow-pill'
                    : 'text-ink-muted hover:bg-white/5 hover:text-ink-foreground'
                )}
              >
                <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                {badge ? (
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums',
                      active ? 'bg-white/25 text-primary-foreground' : 'bg-critical text-critical-foreground'
                    )}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** Tarjeta de organizacion al pie de la barra lateral. */
function OrgCard({
  organizationName,
  role,
}: {
  organizationName: string
  role: AppRole
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-ink-muted">
        Organizacion
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-ink-foreground" title={organizationName}>
        {organizationName}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{ROLE_LABEL[role]}</p>
    </div>
  )
}

export function ConsoleShell({
  children,
  organizationName,
  email,
  role,
  incidentCount = 0,
}: {
  children: React.ReactNode
  organizationName: string
  email: string
  role: AppRole
  /** Incidentes abiertos, para el badge de navegacion. */
  incidentCount?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  // Con el panel abierto se bloquea el scroll del documento (iOS arrastraria la
  // pagina de debajo).
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  // El menu de cuenta se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!accountOpen) return

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [accountOpen])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="app-shell">
      {/* -------------------------------------------------- Barra lateral --- */}
      <aside className="app-sidebar">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto scroll-ink px-3 py-2">
          <NavList pathname={pathname} incidentCount={incidentCount} />
        </div>
        <div className="p-3">
          <OrgCard organizationName={organizationName} role={role} />
        </div>
      </aside>

      {/* ------------------------------------------------------ Contenido --- */}
      <div className="app-content">
        <header className="app-topbar">
          {/* Abrir navegacion en movil. */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            aria-controls="console-mobile-menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          {/* Busqueda. Presentacional por ahora: la busqueda global es una
              iniciativa aparte. Deshabilitada a proposito para no aparentar una
              funcion que aun no existe. */}
          <div className="relative min-w-0 max-w-md flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              disabled
              placeholder="Buscar"
              title="Busqueda global (proximamente)"
              className="h-10 w-full rounded-full border border-border bg-surface-muted pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <InstallAppButton className="hidden xl:inline-flex" />

            <Link
              href="/incidents"
              aria-label="Alertas e incidentes"
              title="Alertas e incidentes"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bell className="h-[1.125rem] w-[1.125rem]" aria-hidden />
            </Link>

            {/* Avatar + menu de cuenta. */}
            <div className="relative" ref={accountRef}>
              <button
                onClick={() => setAccountOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label={`Cuenta de ${email}`}
                title={email}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-pill transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {initials(email)}
              </button>

              {accountOpen ? (
                <div
                  role="menu"
                  aria-label="Cuenta"
                  className="absolute right-0 top-12 z-50 w-64 animate-sheet-in overflow-hidden rounded-2xl border border-border bg-surface shadow-lifted"
                >
                  <div className="px-4 py-3.5">
                    <p className="truncate text-sm font-medium" title={email}>
                      {email}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={organizationName}>
                      {organizationName}
                    </p>
                    <div className="mt-2.5">
                      <Badge tone={role === 'viewer' ? 'neutral' : 'brand'}>
                        {ROLE_LABEL[role]}
                      </Badge>
                    </div>
                  </div>
                  <div className="border-t border-border bg-surface-muted p-2">
                    <InstallAppButton className="mb-1 w-full justify-start border-0 bg-transparent px-2 shadow-none xl:hidden" />
                    <button
                      role="menuitem"
                      onClick={signOut}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      Cerrar sesion
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* -------------------------------------------- Panel movil (drawer) --- */}
      {menuOpen ? (
        <>
          <div
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div id="console-mobile-menu" className="app-sheet animate-sheet-in lg:hidden">
            <div className="flex h-16 items-center justify-between px-5">
              <Brand />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menu"
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scroll-ink px-3 py-2">
              <NavList
                pathname={pathname}
                incidentCount={incidentCount}
                onNavigate={() => setMenuOpen(false)}
              />
            </div>
            <div className="space-y-3 border-t border-white/10 p-3">
              <OrgCard organizationName={organizationName} role={role} />
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="min-w-0 truncate text-xs text-ink-muted" title={email}>
                  {email}
                </p>
                <button
                  onClick={signOut}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-medium text-ink-foreground transition-colors hover:bg-white/5"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Salir
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * Encabezado estandar de pagina. Titulo + contexto + acciones a la derecha.
 */
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
    <header className="shell-container flex flex-col gap-3 pb-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
