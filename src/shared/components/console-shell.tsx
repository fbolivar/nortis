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
  ShieldAlert,
  SlidersHorizontal,
  Lock,
  RefreshCw,
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
 * `short` es la etiqueta que se usa mientras la fila va justa (lg-xl). No es un
 * capricho de espacio: la pastilla oscura con los NOMBRES de las secciones es lo
 * que hace reconocible la consola, y una pastilla de iconos mudos obliga a
 * adivinar. Antes que quitar el texto, se acorta.
 */
const NAV = [
  { href: '/dashboard', label: 'Panel', short: 'Panel', icon: LayoutDashboard },
  { href: '/endpoints', label: 'Equipos', short: 'Equipos', icon: MonitorSmartphone },
  { href: '/activity', label: 'Trazabilidad', short: 'Trazas', icon: FileSearch },
  { href: '/incidents', label: 'Incidentes', short: 'Incidentes', icon: ShieldAlert },
  { href: '/policies', label: 'Politicas', short: 'Politicas', icon: SlidersHorizontal },
  { href: '/vault', label: 'Cifrado', short: 'Cifrado', icon: Lock },
  { href: '/updates', label: 'Actualizaciones', short: 'Updates', icon: RefreshCw },
  { href: '/settings', label: 'Administracion', short: 'Admin', icon: Settings },
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
 * Marca. Lockup real del cliente + nombre de la organizacion.
 *
 * Se usa la variante OSCURA del lockup porque el encabezado es `bg-surface`
 * (blanco): la variante clara es blanca y sobre blanco no existe.
 *
 * `alt=""` a proposito. El enlace ya declara `aria-label="Nortis, ir al panel"`,
 * que sustituye por completo a su contenido para un lector de pantalla; darle
 * texto alternativo al logo solo añadiria ruido si el aria-label desapareciera.
 *
 * `priority`: es la unica imagen por encima del pliegue en TODAS las rutas de la
 * consola, y sin ella Next la carga en diferido y la marca aparece parpadeando.
 */
function Brand({ organizationName }: { organizationName: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="Nortis, ir al panel">
      <Image
        src="/brand/logo.png"
        alt=""
        width={960}
        height={257}
        priority
        sizes="128px"
        className="h-7 w-auto shrink-0 sm:h-8"
      />
      {/*
        Entre lg y xl el nombre de la organizacion se oculta: en ese rango la
        pastilla necesita todo el ancho para mostrar las siete etiquetas, y el
        producto sigue identificado por el propio lockup.
      */}
      <span className="block min-w-0 border-l border-border pl-3 lg:hidden xl:block">
        <span
          className="block truncate text-sm font-medium leading-tight"
          title={organizationName}
        >
          {organizationName}
        </span>
        <span className="block text-xs leading-tight text-muted-foreground">
          Consola de seguridad
        </span>
      </span>
    </Link>
  )
}

/** Boton de icono del encabezado. Circular, 40px, contorno tenue. */
const ICON_ACTION =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-surface text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  // Con el panel abierto se bloquea el scroll del documento: en iOS, si no se
  // bloquea, el gesto arrastra la pagina de debajo y el panel se despega.
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  // El menu de cuenta se cierra al pulsar fuera o con Escape. Sin lo segundo,
  // quien navega con teclado queda atrapado dentro del menu.
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
    <div className="min-h-screen bg-background">
      <div className="app-frame">
        <div className="app-card">
          <header className="app-header border-b border-border/70">
            <div className="shell-container flex h-[4.5rem] items-center justify-between gap-3">
              <Brand organizationName={organizationName} />

              {/*
                Pastilla oscura de navegacion, con los NOMBRES de las secciones.
                Solo texto: los iconos, sumados a siete etiquetas, empujaban la
                pastilla contra la marca y obligaban a partir la fila.
              */}
              <nav
                aria-label="Navegacion principal"
                className="hidden items-center gap-0.5 rounded-full bg-ink p-1.5 shadow-pill lg:flex"
              >
                {NAV.map(({ href, label, short }) => {
                  const active = isActive(pathname, href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors xl:px-4',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                        active
                          ? 'bg-surface text-foreground shadow-sm'
                          : 'text-ink-muted hover:bg-white/10 hover:text-ink-foreground'
                      )}
                    >
                      {/* La etiqueta completa solo cuando sobra ancho de verdad. */}
                      <span className="2xl:hidden">{short}</span>
                      <span className="hidden 2xl:inline">{label}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className="flex shrink-0 items-center gap-2">
                <InstallAppButton className="hidden 2xl:inline-flex" />

                {/* Acciones rapidas. Duplican destinos de la navegacion a proposito:
                    alertas y ajustes son los dos saltos que se hacen desde
                    cualquier pantalla sin querer perder el sitio. */}
                <Link
                  href="/incidents"
                  aria-label="Alertas e incidentes"
                  title="Alertas e incidentes"
                  className={cn(ICON_ACTION, 'hidden lg:flex')}
                >
                  <Bell className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </Link>
                <Link
                  href="/settings"
                  aria-label="Ajustes"
                  title="Ajustes"
                  className={cn(ICON_ACTION, 'hidden lg:flex')}
                >
                  <Settings className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </Link>
                <button
                  onClick={signOut}
                  aria-label="Cerrar sesion"
                  title="Cerrar sesion"
                  className={cn(ICON_ACTION, 'hidden lg:flex')}
                >
                  <LogOut className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </button>

                {/* Avatar. El correo completo ya no ocupa la barra: se consulta
                    aqui, que es donde se busca "con que cuenta estoy". */}
                <div className="relative hidden lg:block" ref={accountRef}>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                    aria-label={`Cuenta de ${email}`}
                    title={email}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-pill transition-transform active:scale-95',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    )}
                  >
                    {initials(email)}
                  </button>

                  {accountOpen ? (
                    <div
                      role="menu"
                      aria-label="Cuenta"
                      className="absolute right-0 top-12 z-50 w-64 animate-sheet-in overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-lifted"
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
                        <InstallAppButton className="mb-1 w-full justify-start border-0 bg-transparent px-2 shadow-none 2xl:hidden" />
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

                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={menuOpen ? 'Cerrar menu' : 'Abrir menu'}
                  aria-expanded={menuOpen}
                  aria-controls="console-mobile-menu"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-ink-foreground shadow-pill transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
                >
                  {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
                </button>
              </div>
            </div>
          </header>

          {menuOpen ? (
            <>
              <div
                className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm lg:hidden"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div
                id="console-mobile-menu"
                className="app-sheet z-[60] animate-sheet-in overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-lifted lg:hidden"
              >
                <nav aria-label="Navegacion principal" className="grid gap-1 p-3 sm:grid-cols-2">
                  {NAV.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href)
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        // El panel se cierra en el propio click y no en un efecto
                        // sobre `pathname`: al pulsar la seccion en la que ya se
                        // esta, la ruta no cambia y el panel se quedaria abierto.
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-colors',
                          active
                            ? 'bg-ink text-ink-foreground'
                            : 'text-foreground hover:bg-muted active:bg-muted'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        {label}
                      </Link>
                    )
                  })}
                </nav>

                <div className="border-t border-border bg-surface-muted px-4 py-4">
                  <p className="truncate text-sm font-medium" title={email}>
                    {email}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Badge tone={role === 'viewer' ? 'neutral' : 'brand'}>{ROLE_LABEL[role]}</Badge>
                    <div className="flex items-center gap-2">
                      <InstallAppButton />
                      <button
                        onClick={signOut}
                        className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <LogOut className="h-4 w-4" aria-hidden />
                        Salir
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}

/**
 * Encabezado estandar de pagina. Titulo + contexto + acciones a la derecha.
 *
 * Sin borde inferior a lo ancho: en un lienzo con tarjetas flotantes, una linea
 * de division completa reintroduce la retícula que el layout evita a proposito.
 * La separacion la da el espacio.
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
    <header className="shell-container flex flex-col gap-3 pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {/* 22px y no 34px: el titulo de ruta ya esta reforzado por el estado
            activo de la navegacion, asi que no necesita competir con las
            metricas que tiene justo debajo. */}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
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
