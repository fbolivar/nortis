import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { ShareClaim } from '@/features/vault/components/share-claim'

export const metadata: Metadata = {
  title: 'Documento seguro — Nortis',
  // Un enlace de descarga jamas debe acabar indexado.
  robots: { index: false, follow: false },
}

/**
 * Descarga publica de un paquete cifrado. Fuera del grupo (console) a proposito:
 * el destinatario no tiene cuenta, y meter esta ruta bajo el shell autenticado
 * obligaria a abrir una excepcion en el middleware — que es exactamente por
 * donde se cuelan los bypass de autenticacion.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
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
          <p className="mt-1.5 text-sm text-muted-foreground">Entrega segura de documentos</p>
        </div>
        <ShareClaim token={token} />
      </div>
    </div>
  )
}
