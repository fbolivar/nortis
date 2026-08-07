'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Pencil, Trash2, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormError,
  Input,
  Label,
  Select,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { Modal } from '@/shared/components/ui/modal'
import { formatDateTime } from '@/lib/utils'
import type { AppRole, ConsoleUser } from '@/shared/types/database'
import {
  createUserSchema,
  setPasswordSchema,
  updateUserSchema,
  type AssignableRole,
} from '../types/schemas'

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  viewer: 'Solo lectura',
}

/** Que dialogo esta abierto y sobre quien. `null` = ninguno. */
type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: ConsoleUser }
  | { kind: 'password'; user: ConsoleUser }
  | { kind: 'delete'; user: ConsoleUser }
  | null

/**
 * Genera una contraseña que cumple la politica sin depender de que el
 * administrador invente una.
 *
 * `crypto.getRandomValues` y no `Math.random()`: esta cadena es la credencial
 * inicial de una cuenta con acceso a la consola de seguridad, y `Math.random()`
 * no es un generador criptografico — su estado interno se puede reconstruir
 * observando unas pocas salidas.
 *
 * Se garantiza una de cada clase por construccion y luego se baraja: componerla
 * "al azar y reintentar si no cumple" puede no terminar, y un bucle sin cota en
 * el camino de creacion de usuarios es peor que un alfabeto predecible.
 */
function suggestPassword(): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  // Sin l/I/1 ni O/0: esta contraseña se dicta por telefono o se copia a mano.
  const all = lower + upper + digits

  const pick = (set: string, n: number) => {
    const bytes = new Uint32Array(n)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => set[b % set.length])
  }

  const chars = [...pick(lower, 1), ...pick(upper, 1), ...pick(digits, 1), ...pick(all, 13)]

  const order = new Uint32Array(chars.length)
  crypto.getRandomValues(order)
  return chars
    .map((c, i) => ({ c, k: order[i] }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c)
    .join('')
}

export function UsersTable({
  users,
  currentUserId,
  isOwner,
  canManage,
}: {
  users: ConsoleUser[]
  currentUserId: string
  isOwner: boolean
  /** owner o admin. Un viewer ve la tabla en solo lectura. */
  canManage: boolean
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  /** Contraseña recien asignada, para poder entregarsela a su dueño. */
  const [issued, setIssued] = useState<{ email: string; password: string }>()

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<AssignableRole>('viewer')
  const [password, setPassword] = useState('')

  function openDialog(next: Exclude<Dialog, null>) {
    setError(undefined)
    setIssued(undefined)

    if (next.kind === 'create') {
      setEmail('')
      setFullName('')
      setRole('viewer')
      setPassword(suggestPassword())
    }
    if (next.kind === 'edit') {
      setFullName(next.user.full_name ?? '')
      // El owner nunca llega al dialogo de edicion de rol, asi que el descarte
      // de 'owner' aqui no pierde ningun caso alcanzable.
      setRole(next.user.role === 'admin' ? 'admin' : 'viewer')
    }
    if (next.kind === 'password') {
      setPassword(suggestPassword())
    }

    setDialog(next)
  }

  /**
   * Envoltura comun de las cuatro operaciones.
   *
   * Los mensajes de las RPC vienen ya redactados para el usuario final ("Solo el
   * propietario puede modificar roles", "Ya existe una cuenta con ese correo"),
   * asi que se muestran tal cual en vez de traducirlos aqui: mantener un mapa de
   * traduccion en el cliente garantiza que algun mensaje nuevo de la base salga
   * sin traducir, y ese sera justo el del caso raro.
   */
  // `PromiseLike` y no `Promise`: supabase.rpc() devuelve un builder que es
  // "thenable" pero no una Promise —no tiene catch ni finally— y solo se
  // convierte en una al esperarlo.
  async function run(operation: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(undefined)
    setPending(true)
    const { error: rpcError } = await operation()
    setPending(false)

    if (rpcError) {
      setError(rpcError.message)
      return false
    }

    router.refresh()
    return true
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault()

    const parsed = createUserSchema.safeParse({ email, fullName, password, role })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    const supabase = createClient()
    const ok = await run(() =>
      supabase.rpc('admin_create_user', {
        p_email: parsed.data.email,
        p_password: parsed.data.password,
        p_full_name: parsed.data.fullName,
        p_role: parsed.data.role,
      })
    )

    if (ok) {
      // El dialogo se cierra pero la contraseña se queda a la vista: es la unica
      // vez que se puede leer, y Nortis todavia no envia correos.
      setIssued({ email: parsed.data.email, password: parsed.data.password })
      setDialog(null)
    }
  }

  async function submitEdit(event: React.FormEvent, user: ConsoleUser) {
    event.preventDefault()

    const parsed = updateUserSchema.safeParse({ fullName, role })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    const supabase = createClient()
    const ok = await run(() =>
      supabase.rpc('admin_update_user', {
        p_user_id: user.id,
        p_full_name: parsed.data.fullName,
        // Solo el owner reparte roles. Un admin que edita a un viewer manda
        // `null` para no tocarlo: enviar el rol actual haria que la RPC
        // rechazara la operacion entera por falta de permiso.
        p_role: isOwner ? parsed.data.role : null,
      })
    )

    if (ok) setDialog(null)
  }

  async function submitPassword(event: React.FormEvent, user: ConsoleUser) {
    event.preventDefault()

    const parsed = setPasswordSchema.safeParse({ password })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    const supabase = createClient()
    const ok = await run(() =>
      supabase.rpc('admin_set_user_password', {
        p_user_id: user.id,
        p_password: parsed.data.password,
      })
    )

    if (ok) {
      setIssued({ email: user.email, password: parsed.data.password })
      setDialog(null)
    }
  }

  async function submitDelete(user: ConsoleUser) {
    const supabase = createClient()
    const ok = await run(() => supabase.rpc('admin_delete_user', { p_user_id: user.id }))
    if (ok) setDialog(null)
  }

  const adminsWithoutMfa = users.filter(
    (u) => (u.role === 'owner' || u.role === 'admin') && !u.mfa_enabled
  ).length

  return (
    <div className="space-y-4">
      {adminsWithoutMfa > 0 ? (
        <Callout tone="warning" title="Administradores sin segundo factor">
          {adminsWithoutMfa}{' '}
          {adminsWithoutMfa === 1
            ? 'usuario administrador no tiene'
            : 'usuarios administradores no tienen'}{' '}
          MFA configurado. Hasta que lo activen, la base de datos les niega el acceso a todos
          los datos de la organizacion — pueden iniciar sesion, pero no veran nada.
        </Callout>
      ) : null}

      {issued ? (
        <Callout tone="success" title="Contraseña asignada">
          Entreguesela a <strong>{issued.email}</strong> por un canal seguro y pidale que la
          cambie al entrar. <strong>No volvera a mostrarse:</strong> en la base solo queda su
          hash, asi que ni Nortis puede recuperarla.
          <p className="mt-2 select-all rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground">
            {issued.password}
          </p>
        </Callout>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Usuarios de consola ({users.length})</CardTitle>
            {canManage ? (
              <Button size="sm" onClick={() => openDialog({ kind: 'create' })}>
                <UserPlus className="h-4 w-4" aria-hidden />
                Agregar usuario
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Segundo factor</Th>
                <Th>Alta</Th>
                {canManage ? (
                  <Th>
                    <span className="sr-only">Acciones</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId
                // Misma regla que `assert_can_administer_user`: un admin no
                // administra a otro admin ni al owner. Aqui solo se oculta el
                // boton; quien decide de verdad es la RPC.
                const manageable =
                  canManage &&
                  !isSelf &&
                  (isOwner || (user.role !== 'owner' && user.role !== 'admin'))

                return (
                  <tr key={user.id} className="hover:bg-surface-muted">
                    <Td>
                      <div className="flex flex-col">
                        <span>{user.full_name ?? user.email}</span>
                        {user.full_name ? (
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={user.role === 'viewer' ? 'neutral' : 'info'}>
                        {ROLE_LABEL[user.role]}
                      </Badge>
                    </Td>
                    <Td>
                      {user.role === 'viewer' && !user.mfa_enabled ? (
                        <span className="text-xs text-muted-foreground">Opcional</span>
                      ) : user.mfa_enabled ? (
                        <Badge tone="success">Activo</Badge>
                      ) : (
                        <Badge tone="warning">Pendiente</Badge>
                      )}
                    </Td>
                    <Td className="tabular-nums text-muted-foreground">
                      {formatDateTime(user.created_at)}
                    </Td>
                    {canManage ? (
                      <Td>
                        {manageable ? (
                          <div className="flex items-center justify-end gap-1">
                            <IconAction
                              label={`Editar ${user.email}`}
                              icon={Pencil}
                              onClick={() => openDialog({ kind: 'edit', user })}
                            />
                            <IconAction
                              label={`Cambiar contraseña de ${user.email}`}
                              icon={KeyRound}
                              onClick={() => openDialog({ kind: 'password', user })}
                            />
                            <IconAction
                              label={`Eliminar ${user.email}`}
                              icon={Trash2}
                              tone="critical"
                              onClick={() => openDialog({ kind: 'delete', user })}
                            />
                          </div>
                        ) : (
                          <p className="text-right text-xs text-muted-foreground">
                            {isSelf ? 'Su cuenta' : '—'}
                          </p>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ Alta --- */}
      <Modal
        open={dialog?.kind === 'create'}
        onClose={() => setDialog(null)}
        title="Agregar usuario"
        description="La cuenta queda activa de inmediato con la contraseña que asigne aqui."
      >
        <form onSubmit={submitCreate} className="space-y-4">
          <div>
            <Label htmlFor="new-email">Correo corporativo</Label>
            <Input
              id="new-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-name">Nombre completo</Label>
            <Input
              id="new-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-role">Rol</Label>
            <Select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
            >
              <option value="viewer">Solo lectura</option>
              {/* Solo el propietario reparte el rol de administrador. */}
              {isOwner ? <option value="admin">Administrador</option> : null}
            </Select>
            {role === 'admin' ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Un administrador debe configurar su segundo factor antes de ver ningun dato:
                la base se lo exige, no la interfaz.
              </p>
            ) : null}
          </div>
          <PasswordField value={password} onChange={setPassword} />
          <DialogActions
            pending={pending}
            error={error}
            submitLabel="Crear cuenta"
            onCancel={() => setDialog(null)}
          />
        </form>
      </Modal>

      {/* --------------------------------------------------------- Edicion --- */}
      <Modal
        open={dialog?.kind === 'edit'}
        onClose={() => setDialog(null)}
        title="Editar usuario"
        description={dialog?.kind === 'edit' ? dialog.user.email : undefined}
      >
        {dialog?.kind === 'edit' ? (
          <form onSubmit={(e) => submitEdit(e, dialog.user)} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nombre completo</Label>
              <Input
                id="edit-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-role">Rol</Label>
              <Select
                id="edit-role"
                value={role}
                disabled={!isOwner}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
              >
                <option value="viewer">Solo lectura</option>
                <option value="admin">Administrador</option>
              </Select>
              {!isOwner ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Solo el propietario puede cambiar roles.
                </p>
              ) : null}
            </div>
            <DialogActions
              pending={pending}
              error={error}
              submitLabel="Guardar cambios"
              onCancel={() => setDialog(null)}
            />
          </form>
        ) : null}
      </Modal>

      {/* ----------------------------------------------------- Contraseña --- */}
      <Modal
        open={dialog?.kind === 'password'}
        onClose={() => setDialog(null)}
        title="Cambiar contraseña"
        description={
          dialog?.kind === 'password'
            ? `Se cerraran todas las sesiones abiertas de ${dialog.user.email}.`
            : undefined
        }
      >
        {dialog?.kind === 'password' ? (
          <form onSubmit={(e) => submitPassword(e, dialog.user)} className="space-y-4">
            <PasswordField value={password} onChange={setPassword} />
            <DialogActions
              pending={pending}
              error={error}
              submitLabel="Asignar contraseña"
              onCancel={() => setDialog(null)}
            />
          </form>
        ) : null}
      </Modal>

      {/* ------------------------------------------------------ Eliminacion --- */}
      <Modal
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        title="Eliminar usuario"
      >
        {dialog?.kind === 'delete' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se eliminara la cuenta de{' '}
              <strong className="text-foreground">{dialog.user.email}</strong> y perdera el
              acceso de inmediato. La accion no se puede deshacer.
            </p>
            <p className="text-sm text-muted-foreground">
              El registro de auditoria <strong className="text-foreground">se conserva</strong>:
              lo que esta persona hizo sigue siendo atribuible despues de eliminarla.
            </p>
            <FormError>{error}</FormError>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => submitDelete(dialog.user)} disabled={pending}>
                {pending ? 'Eliminando…' : 'Eliminar cuenta'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

/* -------------------------------------------------------------- Auxiliares --- */

function IconAction({
  label,
  icon: Icon,
  onClick,
  tone = 'neutral',
}: {
  label: string
  icon: typeof Pencil
  onClick: () => void
  tone?: 'neutral' | 'critical'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // `title` ademas de `sr-only`: el icono solo es evidente para quien ya
      // conoce la convencion, y esta fila borra cuentas.
      title={label}
      className={
        tone === 'critical'
          ? 'rounded-lg p-2 text-muted-foreground transition-colors hover:bg-critical-subtle hover:text-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      }
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </button>
  )
}

/**
 * Campo de contraseña con generador.
 *
 * El valor va SIEMPRE visible, sin `type="password"`. Ocultarlo aqui seria
 * teatro: es una credencial temporal que el administrador tiene que leer y
 * transmitir, y enmascararla solo consigue que la copie mal.
 */
function PasswordField({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Label htmlFor="new-password" className="mb-0">
          Contraseña temporal
        </Label>
        <button
          type="button"
          onClick={() => onChange(suggestPassword())}
          className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Generar otra
        </button>
      </div>
      <Input
        id="new-password"
        // `off` no basta en Chrome para campos que parecen de contraseña; con un
        // token no estandar el gestor no ofrece autorrelleno ni propone guardar
        // la credencial de OTRA persona en el llavero del administrador.
        autoComplete="new-password-nortis"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Minimo 12 caracteres, con minuscula, mayuscula y numero.
      </p>
    </div>
  )
}

function DialogActions({
  pending,
  error,
  submitLabel,
  onCancel,
}: {
  pending: boolean
  error?: string
  submitLabel: string
  onCancel: () => void
}) {
  return (
    <div className="space-y-3">
      <FormError>{error}</FormError>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
