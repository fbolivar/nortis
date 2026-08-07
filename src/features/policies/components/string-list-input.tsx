'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, FormError, Input, Label } from '@/shared/components/ui'

/**
 * Entrada de lista de valores (rutas, dominios, extensiones, seriales).
 *
 * Valida CADA valor al añadirlo y no al guardar el perfil entero. La diferencia
 * importa: si la validacion ocurriera al final, el administrador escribiria
 * quince dominios y recibiria un unico error sin saber cual de los quince esta
 * mal. Un perfil de seguridad mal escrito es un perfil que no protege.
 */
export function StringListInput({
  label,
  help,
  placeholder,
  values,
  onChange,
  validate,
  disabled,
  mono = true,
}: {
  label: string
  help?: string
  placeholder?: string
  values: string[]
  onChange: (next: string[]) => void
  /** Devuelve el valor normalizado, o un mensaje de error. */
  validate: (raw: string) => { ok: true; value: string } | { ok: false; error: string }
  disabled?: boolean
  mono?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string>()

  function add() {
    const raw = draft.trim()
    if (!raw) return

    const result = validate(raw)
    if (!result.ok) {
      setError(result.error)
      return
    }

    if (values.includes(result.value)) {
      setError('Ese valor ya esta en la lista')
      return
    }

    onChange([...values, result.value])
    setDraft('')
    setError(undefined)
  }

  return (
    <div>
      <Label>{label}</Label>
      {help ? <p className="mb-1.5 -mt-1 text-xs text-muted-foreground">{help}</p> : null}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(undefined)
          }}
          onKeyDown={(e) => {
            // Enter añade el valor, no envia el formulario: el administrador
            // esta escribiendo una lista, no terminando de editar el perfil.
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className={mono ? 'font-mono' : undefined}
          disabled={disabled}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={disabled}>
          Añadir
        </Button>
      </div>

      <FormError>{error}</FormError>

      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs"
            >
              <span className={mono ? 'font-mono' : undefined}>{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                disabled={disabled}
                aria-label={`Quitar ${value}`}
                className="text-muted-foreground hover:text-critical disabled:pointer-events-none"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Sin valores — la regla no se aplica.</p>
      )}
    </div>
  )
}
