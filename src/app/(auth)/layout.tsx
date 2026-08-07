import { ShieldCheck } from 'lucide-react'

/**
 * Lienzo de autenticacion.
 *
 * El halo violeta del fondo es el unico adorno del producto y vive aqui a
 * proposito: la pantalla de acceso es la primera impresion y no compite con
 * ningun dato. Dentro de la consola ese mismo recurso estorbaria la lectura de
 * una tabla de incidentes.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12 pb-safe pt-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-pill">
            <ShieldCheck className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-2xl font-semibold tracking-tight">Nortis</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Consola de seguridad de endpoints
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
