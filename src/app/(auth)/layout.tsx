import Image from 'next/image'

/**
 * Lienzo de autenticacion.
 *
 * El halo del fondo es el unico adorno del producto y vive aqui a proposito: la
 * pantalla de acceso es la primera impresion y no compite con ningun dato.
 * Dentro de la consola ese mismo recurso estorbaria la lectura de una tabla de
 * incidentes.
 *
 * Son dos manchas: el azul marino da cuerpo y el cian de la aguja lo levanta.
 * Solo el azul deja un gris azulado apagado; el cian es lo que hace que se
 * reconozca la marca. Aqui el cian SI puede usarse pese a su 1.5:1 sobre blanco
 * porque es puramente decorativo —`aria-hidden`, difuminado y sin nada
 * encima—: la regla prohibe cian con texto o relleno informativo, no un fondo.
 *
 * Y por eso el lema va en `text-foreground` y no en `text-muted-foreground`:
 * medido en el navegador, el gris atenuado cae a 3.9:1 sobre la zona densa del
 * halo —el halo OSCURECE el lienzo— y el texto de 14px necesita 4.5:1. La
 * tinta llena se queda en 11:1 pase lo que pase, incluso si el bloque se centra
 * mas arriba en una ventana baja y queda justo bajo el nucleo de la mancha.
 *
 * El lockup lleva `alt="Nortis"` —y no vacio como en el encabezado de la
 * consola— porque aqui es la UNICA forma de saber en que producto se esta
 * entrando: se retiro el texto "Nortis" que lo acompañaba, que junto al logo
 * habria hecho que un lector de pantalla anunciara el nombre dos veces.
 *
 * Variante OSCURA del lockup: cae sobre `bg-background`, que es casi blanco.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12 pb-safe pt-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[22rem] w-[22rem] -translate-x-[70%] rounded-full bg-accent/20 blur-3xl"
      />

      <div className="relative w-full max-w-md">
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
          <p className="mt-3 text-sm text-foreground">Consola de seguridad de endpoints</p>
        </div>
        {children}
      </div>
    </div>
  )
}
