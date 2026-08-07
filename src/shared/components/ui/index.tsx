/**
 * Primitivos de UI de Nortis.
 *
 * Se agrupan en un solo modulo (y no un archivo por componente al estilo shadcn)
 * porque son pocos, pequeños y se usan siempre juntos. Cuando el catalogo crezca
 * —o cuando se incorpore un componente de shadcn con dependencias propias— se
 * separa. Fragmentarlo ahora solo añadiria ruido de imports.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------- Button --- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-pill hover:bg-primary/90 active:bg-primary/95',
  secondary: 'bg-surface text-foreground border border-border hover:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  // Acciones destructivas: unico boton que usa color de estado, porque la
  // consecuencia es la que se esta comunicando.
  danger: 'bg-critical text-critical-foreground hover:bg-critical/90',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        // Pastilla completa: es la forma que define el sistema, del boton
        // principal a las pestañas y a la navegacion.
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        // 40px de alto minimo: es el objetivo tactil aceptable en telefono, y
        // esta consola se usa tambien instalada como PWA.
        size === 'sm' ? 'h-9 px-4 text-sm' : 'h-11 px-5 text-sm',
        BUTTON_VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
)
Button.displayName = 'Button'

/* ----------------------------------------------------------------- Input --- */

const FIELD_BASE =
  'w-full rounded-xl border border-border bg-input px-4 text-base transition-colors ' +
  'placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    // 16px de fuente y no menos: por debajo de eso Safari en iOS hace zoom
    // automatico al enfocar el campo y descuadra el formulario.
    <input ref={ref} className={cn(FIELD_BASE, 'h-12', className)} {...props} />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(FIELD_BASE, 'py-3', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(FIELD_BASE, 'h-12 pr-10', className)} {...props} />
))
Select.displayName = 'Select'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-2 block text-sm font-medium text-foreground', className)}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ Card --- */

/**
 * Tarjeta blanca sobre lienzo lavanda.
 *
 * La separacion la hace el contraste de superficie mas la sombra difusa, no un
 * borde: en una rejilla de seis tarjetas, seis bordes duros crean una malla que
 * compite con el contenido. El borde queda como refuerzo tenue para pantallas
 * donde la sombra casi no se aprecia.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-surface shadow-card',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 sm:px-6 sm:pt-6', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-5 sm:px-6 sm:py-6', className)} {...props} />
}

/* ----------------------------------------------------------------- Badge --- */

type BadgeTone = 'neutral' | 'critical' | 'warning' | 'success' | 'info' | 'brand'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-primary-subtle text-primary',
  critical: 'bg-critical-subtle text-critical',
  warning: 'bg-warning-subtle text-warning',
  success: 'bg-success-subtle text-success',
  info: 'bg-info-subtle text-info',
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        BADGE_TONES[tone],
        className
      )}
      {...props}
    />
  )
}

/* ----------------------------------------------------------------- Table --- */

/**
 * En movil la tabla scrollea horizontalmente dentro de su propio contenedor.
 * Nunca se deja que empuje el ancho del documento: un scroll horizontal en el
 * body rompe la navegacion pegajosa y en la PWA se lee como un fallo de la app.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          // Ancho minimo: por debajo de esto las celdas se estrujan y la tabla
          // deja de ser comparable columna a columna. Scrollea, no se rompe.
          'w-full min-w-[34rem] border-collapse text-sm',
          // La ultima fila no dibuja borde: dentro de una tarjeta redondeada,
          // una linea pegada al radio inferior se ve como un corte.
          '[&_tbody_tr:last-child_td]:border-b-0',
          className
        )}
        {...props}
      />
    </div>
  )
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-border px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6',
        className
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'border-b border-border/60 px-4 py-3.5 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6',
        className
      )}
      {...props}
    />
  )
}

/* ------------------------------------------------------------ EmptyState --- */

/**
 * Un estado vacio siempre dice QUE no hay y en QUE ventana de tiempo. Una tabla
 * vacia sin contexto es ambigua: el analista no sabe si no hay incidentes o si
 * el filtro esta mal puesto — y esas dos lecturas llevan a decisiones opuestas.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-base font-semibold">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------- Callout --- */

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: BadgeTone
  title?: string
  children: React.ReactNode
}) {
  const borders: Record<BadgeTone, string> = {
    neutral: 'border-border bg-surface-muted',
    brand: 'border-primary/25 bg-primary-subtle',
    critical: 'border-critical/25 bg-critical-subtle',
    warning: 'border-warning/25 bg-warning-subtle',
    success: 'border-success/25 bg-success-subtle',
    info: 'border-info/25 bg-info-subtle',
  }

  return (
    <div className={cn('rounded-2xl border px-5 py-4 text-sm', borders[tone])}>
      {title ? <p className="mb-1.5 font-semibold text-foreground">{title}</p> : null}
      <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </div>
  )
}

/* --------------------------------------------------------------- FormError --- */

export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm font-medium text-critical">
      {children}
    </p>
  )
}
