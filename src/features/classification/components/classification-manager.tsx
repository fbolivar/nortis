'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
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
} from '@/shared/components/ui'
import type { Classification } from '../lib/classify'

/** Tonos de grafica del tema, para pintar la etiqueta de cada clasificacion. */
const PALETTE = ['#0284c7', '#c2410c', '#075985', '#be185d', '#047857', '#a16207']

/** "a, b ,c" -> ['a','b','c'] sin vacios ni espacios. */
function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Normaliza una extension a ".ext" en minusculas. */
function normalizeExt(e: string): string {
  const t = e.trim().toLowerCase()
  if (!t) return ''
  return t.startsWith('.') ? t : `.${t}`
}

export function ClassificationManager({
  organizationId,
  classifications,
  canEdit,
}: {
  organizationId: string
  classifications: Classification[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [extensions, setExtensions] = useState('')
  const [keywords, setKeywords] = useState('')
  const [patterns, setPatterns] = useState('')
  const [sensitive, setSensitive] = useState(false)

  function create() {
    const nombre = name.trim()
    if (!nombre) return
    setError(undefined)
    startTransition(async () => {
      const supabase = createClient()
      const { error: e } = await supabase.from('data_classifications').insert({
        organization_id: organizationId,
        name: nombre,
        color,
        extensions: parseList(extensions).map(normalizeExt).filter(Boolean),
        path_keywords: parseList(keywords).map((k) => k.toLowerCase()),
        // Los patrones de contenido son regex (pueden llevar comas): uno por linea.
        content_patterns: patterns
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        sensitive,
        sort_order: classifications.length + 1,
      })
      if (e) {
        setError(e.message)
        return
      }
      setName('')
      setExtensions('')
      setKeywords('')
      setPatterns('')
      setSensitive(false)
      router.refresh()
    })
  }

  function remove(id: string) {
    setError(undefined)
    startTransition(async () => {
      const supabase = createClient()
      const { error: e } = await supabase.from('data_classifications').delete().eq('id', id)
      if (e) {
        setError(e.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="max-w-4xl space-y-4">
      <Callout tone="info" title="Clasificacion de datos">
        Nortis etiqueta cada archivo por su <strong>extension</strong>, por{' '}
        <strong>palabras clave en la ruta</strong> y por <strong>contenido</strong> (el agente evalua
        los patrones regex localmente y reporta solo la etiqueta). Estas etiquetas alimentan el
        bloque <strong>&quot;Datos por clasificacion&quot;</strong> del panel y, cuando una clase se
        marca como <strong>sensible</strong>, elevan la severidad de los incidentes que la involucran.
      </Callout>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Nueva clasificacion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cl-name">Nombre</Label>
                <Input
                  id="cl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="p. ej. Contratos"
                />
              </div>
              <div>
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Color ${c}`}
                      className={
                        'h-7 w-7 rounded-full ring-offset-2 transition-transform ' +
                        (color === c ? 'ring-2 ring-primary scale-110' : 'hover:scale-110')
                      }
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="cl-ext">Extensiones (separadas por coma)</Label>
                <Input
                  id="cl-ext"
                  value={extensions}
                  onChange={(e) => setExtensions(e.target.value)}
                  placeholder=".pdf, .docx"
                  className="font-mono"
                />
              </div>
              <div>
                <Label htmlFor="cl-kw">Palabras clave en la ruta (coma)</Label>
                <Input
                  id="cl-kw"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="contratos, legal"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cl-pat">Patrones de contenido (regex, uno por linea)</Label>
                <textarea
                  id="cl-pat"
                  value={patterns}
                  onChange={(e) => setPatterns(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder={'\\b(?:\\d[ -]?){13,16}\\b\n(?i)cedula[^0-9]{0,10}\\d{6,10}'}
                  className="w-full rounded-xl border border-border bg-input px-4 py-3 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  El agente los evalua sobre el contenido del archivo (Fase B) y reporta solo la
                  etiqueta. Requiere autorizacion de tratamiento de datos firmada.
                </p>
              </div>
              <label
                htmlFor="cl-sensitive"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3 sm:col-span-2"
              >
                <input
                  id="cl-sensitive"
                  type="checkbox"
                  checked={sensitive}
                  onChange={(e) => setSensitive(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-critical"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <ShieldAlert className="h-4 w-4 text-critical" aria-hidden />
                    Dato sensible
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Un incidente que involucre un archivo de esta clase{' '}
                    <strong>sube de severidad</strong> (a &quot;Alta&quot; si estaba por debajo) y se
                    prioriza en la cola.
                  </span>
                </span>
              </label>
            </div>
            <FormError>{error}</FormError>
            <Button onClick={create} disabled={pending || !name.trim()}>
              Crear clasificacion
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Clasificaciones ({classifications.length})</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Una ruta se etiqueta con la primera clasificacion que casa, de arriba abajo.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {classifications.length === 0 ? (
            <div className="p-2">
              <EmptyState
                title="Sin clasificaciones"
                description="Cree una para empezar a etiquetar los datos por clase."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {classifications.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                      <span className="text-sm font-medium">{c.name}</span>
                      {c.sensitive ? (
                        <span
                          title="Los incidentes sobre esta clase suben de severidad"
                          className="inline-flex items-center gap-1 rounded-md bg-critical-subtle px-1.5 py-0.5 text-xs font-medium text-critical"
                        >
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          Sensible
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.extensions.map((e) => (
                        <span
                          key={e}
                          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                        >
                          {e}
                        </span>
                      ))}
                      {c.path_keywords.map((k) => (
                        <span
                          key={k}
                          className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {k}
                        </span>
                      ))}
                      {c.content_patterns.map((p) => (
                        <span
                          key={p}
                          title="Patron de contenido (regex)"
                          className="rounded-md bg-warning-subtle px-1.5 py-0.5 font-mono text-xs text-warning"
                        >
                          {p}
                        </span>
                      ))}
                      {c.extensions.length === 0 &&
                      c.path_keywords.length === 0 &&
                      c.content_patterns.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Sin reglas</span>
                      ) : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      disabled={pending}
                      title={`Eliminar ${c.name}`}
                      className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-critical-subtle hover:text-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Eliminar {c.name}</span>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
