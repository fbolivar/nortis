'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormError,
  Input,
  Label,
  Select,
} from '@/shared/components/ui'

type Site = { id: string; name: string }
type Endpoint = { id: string; hostname: string | null; site_id: string | null }

export function SitesManager({
  organizationId,
  sites,
  endpoints,
  canEdit,
}: {
  organizationId: string
  sites: Site[]
  endpoints: Endpoint[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()

  const countBySite = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of endpoints) {
      if (e.site_id) m.set(e.site_id, (m.get(e.site_id) ?? 0) + 1)
    }
    return m
  }, [endpoints])

  function createSite() {
    const nombre = name.trim()
    if (!nombre) return
    setError(undefined)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('sites')
        .insert({ organization_id: organizationId, name: nombre })
      if (error) {
        setError(error.message)
        return
      }
      setName('')
      router.refresh()
    })
  }

  function deleteSite(id: string) {
    setError(undefined)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('sites').delete().eq('id', id)
      if (error) {
        setError(error.message)
        return
      }
      router.refresh()
    })
  }

  function assignEndpoint(endpointId: string, siteId: string) {
    setError(undefined)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('endpoints')
        .update({ site_id: siteId || null })
        .eq('id', endpointId)
      if (error) {
        setError(error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <Callout tone="neutral">
          Su rol permite consultar las sedes pero no gestionarlas. Se requiere owner o admin.
        </Callout>
      ) : null}

      {/* Sedes */}
      <Card>
        <CardHeader>
          <CardTitle>Sedes</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Agrupe sus equipos por sede u oficina. Luego podra delegar la administracion de
            cada sede y ver sus estadisticas por separado.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1">
                <Label htmlFor="site-name">Nueva sede</Label>
                <Input
                  id="site-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="p. ej. Oficina Bogota"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createSite()
                  }}
                />
              </div>
              <Button onClick={createSite} disabled={pending || !name.trim()}>
                Crear sede
              </Button>
            </div>
          ) : null}

          <FormError>{error}</FormError>

          {sites.length === 0 ? (
            <EmptyState
              title="Aun no hay sedes"
              description="Cree una sede para empezar a organizar sus equipos."
            />
          ) : (
            <ul className="divide-y divide-border">
              {sites.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {countBySite.get(s.id) ?? 0} equipo(s)
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteSite(s.id)}
                      disabled={pending}
                    >
                      Eliminar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Asignacion de equipos */}
      <Card>
        <CardHeader>
          <CardTitle>Equipos por sede</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Asigne cada equipo a su sede.
          </p>
        </CardHeader>
        <CardContent>
          {endpoints.length === 0 ? (
            <EmptyState title="No hay equipos con agente todavia" />
          ) : (
            <ul className="divide-y divide-border">
              {endpoints.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.hostname ?? 'equipo'}</p>
                    {!e.site_id ? (
                      <Badge tone="warning" className="mt-1">
                        Sin sede
                      </Badge>
                    ) : null}
                  </div>
                  <Select
                    value={e.site_id ?? ''}
                    onChange={(ev) => assignEndpoint(e.id, ev.target.value)}
                    disabled={!canEdit || pending}
                    className="max-w-[14rem]"
                  >
                    <option value="">Sin sede</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
