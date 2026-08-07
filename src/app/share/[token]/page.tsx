import type { Metadata } from 'next'
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <p className="text-lg font-semibold tracking-tight">NORTIS</p>
          <p className="mt-1 text-xs text-muted-foreground">Entrega segura de documentos</p>
        </div>
        <ShareClaim token={token} />
      </div>
    </div>
  )
}
