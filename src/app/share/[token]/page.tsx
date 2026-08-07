import type { Metadata } from 'next'
import Image from 'next/image'
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
      {/* Mismo halo de dos manchas que el lienzo de autenticacion: azul marino
          para dar cuerpo y cian de la aguja para levantarlo. Decorativo, sin
          nada encima, asi que el bajo contraste del cian no aplica. El halo
          oscurece el lienzo, asi que el lema de debajo va en tinta llena y no
          en gris atenuado — ver el comentario del layout de (auth). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[22rem] w-[22rem] -translate-x-[70%] rounded-full bg-accent/20 blur-3xl"
      />
      <div className="relative w-full max-w-md">
        {/*
          Lockup oscuro: el fondo de esta pagina es `bg-background`, casi blanco.
          `alt="Nortis"` porque quien llega aqui no tiene cuenta y el logo es la
          unica señal de quien le esta entregando el documento — no hay ningun
          otro texto con el nombre del producto en la pantalla.
        */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/brand/logo.png"
            alt="Nortis"
            width={960}
            height={257}
            priority
            sizes="240px"
            className="h-11 w-auto sm:h-12"
          />
          <p className="mt-3 text-sm text-foreground">Entrega segura de documentos</p>
        </div>
        <ShareClaim token={token} />
      </div>
    </div>
  )
}
