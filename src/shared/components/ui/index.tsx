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
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-muted text-foreground hover:bg-muted/70 border border-border',
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
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        BUTTON_VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
)
Button.displayName = 'Button'

/* ----------------------------------------------------------------- Input --- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-input px-3 text-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ Card --- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border px-4 py-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-0.5 text-xs text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3', className)} {...props} />
}

/* ----------------------------------------------------------------- Badge --- */

type BadgeTone = 'neutral' | 'critical' | 'warning' | 'success' | 'info'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
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
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className
      )}
      {...props}
    />
  )
}

/* ----------------------------------------------------------------- Table --- */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-border px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-border/60 px-3 py-2 align-middle', className)} {...props} />
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
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
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
    critical: 'border-critical/40 bg-critical-subtle/40',
    warning: 'border-warning/40 bg-warning-subtle/40',
    success: 'border-success/40 bg-success-subtle/40',
    info: 'border-info/40 bg-info-subtle/40',
  }

  return (
    <div className={cn('rounded-md border px-3 py-2.5 text-xs', borders[tone])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </div>
  )
}

/* --------------------------------------------------------------- FormError --- */

export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-xs text-critical">
      {children}
    </p>
  )
}
