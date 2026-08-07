'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  FormError,
} from '@/shared/components/ui'

interface AssignableEndpoint {
  id: string
  hostname: string
  assigned_profile_id: string | null
}

/**
 * Asignacion de un perfil a equipos.
 *
 * Se guarda con un solo boton y no equipo por equipo: aplicar una politica a
 * quince maquinas de una en una son quince oportunidades de dejar la mitad del
 * parque con una regla y la otra mitad con otra, que es peor que no aplicarla.
 */
export function ProfileAssignment({
  profileId,
  profileName,
  endpoints,
  canEdit,
}: {
  profileId: string
  profileName: string
  endpoints: AssignableEndpoint[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(
    new Set(endpoints.filter((e) => e.assigned_profile_id === profileId).map((e) => e.id))
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const originallyAssigned = new Set(
    endpoints.filter((e) => e.assigned_profile_id === profileId).map((e) => e.id)
  )

  const toAdd = [...selected].filter((id) => !originallyAssigned.has(id))
  const toRemove = [...originallyAssigned].filter((id) => !selected.has(id))
  const dirty = toAdd.length > 0 || toRemove.length > 0

  async function save() {
    setError(undefined)
    setPending(true)
    const supabase = createClient()

    if (toAdd.length) {
      const { error: addError } = await supabase
        .from('endpoints')
        .update({ assigned_profile_id: profileId })
        .in('id', toAdd)
      if (addError) {
        setPending(false)
        setError(addError.message)
        return
      }
    }

    if (toRemove.length) {
      // Quitar el perfil deja el equipo SIN reglas, no con las del perfil por
      // defecto: reasignarlo en silencio a otra politica seria una decision que
      // el administrador no tomo.
      const { error: removeError } = await supabase
        .from('endpoints')
        .update({ assigned_profile_id: null })
        .in('id', toRemove)
      if (removeError) {
        setPending(false)
        setError(removeError.message)
        return
      }
    }

    setPending(false)
    router.refresh()
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipos con este perfil</CardTitle>
        <CardDescription>
          Los agentes descargan la politica en su siguiente sincronizacion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {endpoints.length === 0 ? (
          <EmptyState
            title="Sin equipos registrados"
            description="Instale el agente en al menos una estacion para poder asignarle politicas."
          />
        ) : (
          <>
            <ul className="space-y-1">
              {endpoints.map((endpoint) => {
                const otherProfile =
                  endpoint.assigned_profile_id && endpoint.assigned_profile_id !== profileId

                return (
                  <li key={endpoint.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        checked={selected.has(endpoint.id)}
                        onChange={() => toggle(endpoint.id)}
                        disabled={!canEdit}
                      />
                      <span className="flex-1">{endpoint.hostname}</span>
                      {otherProfile && !selected.has(endpoint.id) ? (
                        <Badge tone="neutral">Otro perfil</Badge>
                      ) : null}
                      {otherProfile && selected.has(endpoint.id) ? (
                        // Aviso explicito: asignar aqui REEMPLAZA la politica que
                        // el equipo tenia, no la suma.
                        <Badge tone="warning">Reemplaza su perfil actual</Badge>
                      ) : null}
                      {!endpoint.assigned_profile_id && !selected.has(endpoint.id) ? (
                        <Badge tone="warning">Sin perfil</Badge>
                      ) : null}
                    </label>
                  </li>
                )
              })}
            </ul>

            {canEdit ? (
              <div className="flex items-center gap-3 border-t border-border pt-3">
                <Button onClick={save} disabled={!dirty || pending} size="sm">
                  {pending ? 'Aplicando…' : 'Aplicar asignacion'}
                </Button>
                {dirty ? (
                  <p className="text-xs text-muted-foreground">
                    {toAdd.length > 0 ? `${toAdd.length} por asignar` : null}
                    {toAdd.length > 0 && toRemove.length > 0 ? ' · ' : null}
                    {toRemove.length > 0
                      ? `${toRemove.length} quedaran sin politica`
                      : null}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin cambios pendientes</p>
                )}
              </div>
            ) : null}

            <FormError>{error}</FormError>

            {toRemove.length > 0 ? (
              <p className="text-xs text-warning">
                Los equipos que retire de <strong>{profileName}</strong> quedaran sin
                ninguna regla aplicada hasta que se les asigne otro perfil.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
