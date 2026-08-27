'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormError,
} from '@/shared/components/ui'

/** Permisos granulares concedibles a un usuario de solo lectura. */
const PERMISSIONS: { key: string; label: string }[] = [
  { key: 'incidents.manage', label: 'Gestionar incidentes' },
  { key: 'tasks.issue', label: 'Emitir acciones remotas' },
  { key: 'policies.manage', label: 'Editar politicas' },
  { key: 'exceptions.approve', label: 'Aprobar excepciones' },
]

export interface PermUser {
  id: string
  name: string
  permissions: string[]
}

/**
 * Concede permisos puntuales a usuarios de solo lectura, sin convertirlos en
 * administradores. Los administradores ya tienen todo, asi que no aparecen aqui.
 */
export function UserPermissions({ users, canManage }: { users: PermUser[]; canManage: boolean }) {
  if (users.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Permisos de solo-lectura</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Concede capacidades puntuales a un usuario de solo lectura sin hacerlo administrador. Los
          administradores ya tienen todas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {users.map((u) => (
          <PermRow key={u.id} user={u} canManage={canManage} />
        ))}
      </CardContent>
    </Card>
  )
}

function PermRow({ user, canManage }: { user: PermUser; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [perms, setPerms] = useState<Set<string>>(new Set(user.permissions))

  function toggle(key: string) {
    setSaved(false)
    setPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function save() {
    setError(undefined)
    setSaved(false)
    start(async () => {
      const supabase = createClient()
      const { error: e } = await supabase.rpc('set_user_permissions', {
        p_user_id: user.id,
        p_permissions: [...perms],
      })
      if (e) setError(e.message)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 text-sm font-medium">{user.name}</div>
      <div className="flex flex-wrap gap-1.5">
        {PERMISSIONS.map((p) => {
          const on = perms.has(p.key)
          return (
            <button
              key={p.key}
              type="button"
              disabled={!canManage}
              onClick={() => toggle(p.key)}
              className={
                'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
                (on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface-muted text-muted-foreground hover:border-primary/40')
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {error ? <FormError>{error}</FormError> : null}
      {canManage ? (
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending}>
            Guardar
          </Button>
          {saved ? <span className="text-sm text-success">Guardado.</span> : null}
        </div>
      ) : null}
    </div>
  )
}
