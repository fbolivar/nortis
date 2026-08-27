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
  Input,
  Label,
} from '@/shared/components/ui'

/**
 * Retencion de datos. Las capturas de pantalla se purgan a diario segun estos
 * dias por organizacion. Los eventos de actividad se purgan por particion (90
 * dias, comun a todos los tenants) y no se configuran aqui.
 */
export function RetentionPanel({
  screenshotDays,
  canEdit,
}: {
  screenshotDays: number
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [days, setDays] = useState(screenshotDays)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  function save() {
    setError(undefined)
    setSaved(false)
    start(async () => {
      const supabase = createClient()
      const { error: e } = await supabase.rpc('set_data_retention', { p_screenshot_days: days })
      if (e) setError(e.message)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retencion de datos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs">
          <Label htmlFor="ret-shots">Capturas de pantalla (dias)</Label>
          <Input
            id="ret-shots"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
            disabled={!canEdit}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Las capturas mas antiguas se eliminan cada dia. Entre 1 y 365 dias.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Los eventos de actividad se conservan 90 dias (purga comun por particiones).
        </p>
        {saved ? <p className="text-sm text-success">Guardado.</p> : null}
        <FormError>{error}</FormError>
        {canEdit ? (
          <Button onClick={save} disabled={pending || days === screenshotDays}>
            Guardar
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Solo un administrador puede cambiar la retencion.</p>
        )}
      </CardContent>
    </Card>
  )
}
