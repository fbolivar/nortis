'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormError,
  Input,
  Label,
} from '@/shared/components/ui'
import { StringListInput } from './string-list-input'
import { PolicySimulator } from './policy-simulator'
import {
  CLIPBOARD_MODE_HELP,
  CLIPBOARD_MODE_LABEL,
  PRINTING_MODE_HELP,
  PRINTING_MODE_LABEL,
  POLICY_SCHEMA_VERSION,
  USB_MODE_HELP,
  USB_MODE_LABEL,
  domain,
  emptyPolicyConfig,
  extension,
  folderPath,
  processName,
  usbSerial,
  type PolicyConfig,
} from '@/shared/schemas/policy'
import type { Json, SecurityProfile } from '@/shared/types/database'

/*
 * Validadores de las listas. Son los MISMOS objetos Zod que componen el contrato
 * del agente, importados directamente: lo que el editor acepta es por
 * construccion lo que el agente entiende, sin una segunda copia de las reglas
 * que pueda quedar desincronizada.
 */
type FieldValidator = { safeParse: (v: unknown) => ReturnType<typeof folderPath.safeParse> }

function makeValidator(schema: FieldValidator) {
  return (raw: string) => {
    const result = schema.safeParse(raw)
    return result.success
      ? ({ ok: true, value: result.data } as const)
      : ({ ok: false, error: result.error.issues[0]?.message ?? 'Valor no valido' } as const)
  }
}

const validatePath = makeValidator(folderPath)
const validateExtension = makeValidator(extension)
const validateDomain = makeValidator(domain)
const validateSerial = makeValidator(usbSerial)
const validateProcess = makeValidator(processName)

/** Selector de modo como grupo de opciones con su consecuencia escrita al lado. */
function ModeSelector<T extends string>({
  legend,
  value,
  options,
  labels,
  help,
  onChange,
}: {
  legend: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  help: Record<T, string>
  onChange: (next: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {legend}
      </legend>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface-muted/40 px-2.5 py-2 hover:bg-surface-muted"
          >
            <input
              type="radio"
              name={legend}
              checked={value === option}
              onChange={() => onChange(option)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm">{labels[option]}</span>
              {/* La consecuencia se muestra siempre, no solo en la opcion
                  elegida: se decide comparando, no leyendo una a una. */}
              <span className="block text-xs text-muted-foreground">{help[option]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function PolicyEditor({
  profile,
  initialConfig,
  endpoints,
  consentSigned,
  canEdit,
}: {
  profile: SecurityProfile | null
  initialConfig: PolicyConfig
  endpoints: { id: string; hostname: string; assigned_profile_id: string | null }[]
  consentSigned: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const isNew = profile === null

  const [name, setName] = useState(profile?.name ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [isDefault, setIsDefault] = useState(profile?.is_default ?? false)
  const [config, setConfig] = useState<PolicyConfig>(initialConfig ?? emptyPolicyConfig())
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  /** Actualiza una seccion sin perder el resto del objeto. */
  function patch<K extends keyof PolicyConfig>(section: K, value: Partial<PolicyConfig[K]>) {
    setConfig((prev) => ({ ...prev, [section]: { ...prev[section], ...value } }))
  }

  async function save() {
    setError(undefined)

    if (name.trim().length < 2) {
      setError('El perfil necesita un nombre')
      return
    }

    setPending(true)
    const supabase = createClient()

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      is_default: isDefault,
      schema_version: POLICY_SCHEMA_VERSION,
      config: config as unknown as Json,
    }

    if (isNew) {
      const { data: userData } = await supabase.auth.getUser()
      const { data: orgId } = await supabase.rpc('current_org_id')

      const { data, error: insertError } = await supabase
        .from('security_profiles')
        .insert({ ...payload, organization_id: orgId as string, created_by: userData.user?.id })
        .select('id')
        .single()

      setPending(false)

      if (insertError) {
        setError(insertError.message)
        return
      }
      router.replace(`/policies/${data.id}`)
      router.refresh()
      return
    }

    const { error: updateError } = await supabase
      .from('security_profiles')
      .update(payload)
      .eq('id', profile.id)

    setPending(false)

    if (updateError) {
      // El trigger de consentimiento devuelve un mensaje ya redactado para el
      // usuario final; se muestra tal cual.
      setError(updateError.message)
      return
    }
    router.refresh()
  }

  const assignedCount = endpoints.filter((e) => e.assigned_profile_id === profile?.id).length

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Identificacion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Oficina Bogota"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="description">Descripcion</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Personal administrativo en sede principal"
                disabled={!canEdit}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              disabled={!canEdit}
              className="mt-1"
            />
            <span>
              Perfil por defecto
              <span className="block text-xs text-muted-foreground">
                Se asigna automaticamente a todo equipo que se registre sin perfil
                explicito. Sin uno, cada equipo nuevo queda sin reglas hasta que alguien
                se acuerde de asignarle una.
              </span>
            </span>
          </label>

          {!isNew ? (
            <p className="text-xs text-muted-foreground">
              Aplicado a <strong className="text-foreground">{assignedCount}</strong>{' '}
              {assignedCount === 1 ? 'equipo' : 'equipos'} · version de esquema{' '}
              {profile.schema_version}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------- Almacenamiento */}
      <Card>
        <CardHeader>
          <CardTitle>Guardado de archivos</CardTitle>
          <CardDescription>Donde puede guardar el usuario y que extensiones se impiden</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StringListInput
            label="Carpetas autorizadas"
            help="Si deja la lista vacia no se restringe el guardado. Con una sola carpeta, TODO lo demas queda bloqueado — simule antes de aplicar."
            placeholder="D:\Compartido"
            values={config.storage.allowed_paths}
            onChange={(allowed_paths) => patch('storage', { allowed_paths })}
            validate={validatePath}
            disabled={!canEdit}
          />
          <StringListInput
            label="Extensiones prohibidas"
            placeholder=".exe"
            values={config.storage.blocked_extensions}
            onChange={(blocked_extensions) => patch('storage', { blocked_extensions })}
            validate={validateExtension}
            disabled={!canEdit}
          />
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- USB */}
      <Card>
        <CardHeader>
          <CardTitle>Dispositivos USB</CardTitle>
          <CardDescription>Canal de fuga mas comun en equipos sin dominio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModeSelector
            legend="Comportamiento ante almacenamiento masivo"
            value={config.usb.mode}
            options={['allow', 'read_only', 'block'] as const}
            labels={USB_MODE_LABEL}
            help={USB_MODE_HELP}
            onChange={(mode) => patch('usb', { mode })}
          />
          {config.usb.mode !== 'allow' ? (
            <StringListInput
              label="Seriales autorizados"
              help="Dispositivos corporativos que siguen funcionando pese al bloqueo. El serial aparece en el detalle del evento de conexion."
              placeholder="KINGSTON-A7F31C"
              values={config.usb.serial_allowlist}
              onChange={(serial_allowlist) => patch('usb', { serial_allowlist })}
              validate={validateSerial}
              disabled={!canEdit}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- Web */}
      <Card>
        <CardHeader>
          <CardTitle>Navegacion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StringListInput
            label="Dominios bloqueados"
            placeholder="wetransfer.com"
            values={config.web.blocked_domains}
            onChange={(blocked_domains) => patch('web', { blocked_domains })}
            validate={validateDomain}
            disabled={!canEdit}
          />
          <StringListInput
            label="Lista blanca de dominios"
            help="ATENCION: si añade aunque sea uno, todo lo que no este en la lista queda bloqueado. Es la regla que mas trabajo legitimo interrumpe."
            placeholder="portal.sap.com"
            values={config.web.allowed_domains}
            onChange={(allowed_domains) => patch('web', { allowed_domains })}
            validate={validateDomain}
            disabled={!canEdit}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.web.block_webmail}
              onChange={(e) => patch('web', { block_webmail: e.target.checked })}
              disabled={!canEdit}
              className="mt-1"
            />
            <span>
              Bloquear correo personal
              <span className="block text-xs text-muted-foreground">
                Gmail, Outlook, Yahoo, Proton y similares. Canal habitual de salida de
                documentos hacia fuera de la empresa.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- Portapapeles */}
      <Card>
        <CardHeader>
          <CardTitle>Portapapeles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModeSelector
            legend="Comportamiento al copiar"
            value={config.clipboard.mode}
            options={['allow', 'alert', 'block'] as const}
            labels={CLIPBOARD_MODE_LABEL}
            help={CLIPBOARD_MODE_HELP}
            onChange={(mode) => patch('clipboard', { mode })}
          />
          {config.clipboard.mode !== 'allow' ? (
            <StringListInput
              label="Aplicaciones de origen protegidas"
              help="Solo se interviene lo copiado DESDE estas aplicaciones. Si deja la lista vacia, la regla aplica a todo el sistema."
              placeholder="sap.exe"
              values={config.clipboard.protected_sources}
              onChange={(protected_sources) => patch('clipboard', { protected_sources })}
              validate={validateProcess}
              disabled={!canEdit}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------- Impresion */}
      <Card>
        <CardHeader>
          <CardTitle>Impresion</CardTitle>
        </CardHeader>
        <CardContent>
          <ModeSelector
            legend="Trabajos de impresion"
            value={config.printing.mode}
            options={['allow', 'log', 'block'] as const}
            labels={PRINTING_MODE_LABEL}
            help={PRINTING_MODE_HELP}
            onChange={(mode) => patch('printing', { mode })}
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------- Cifrado */}
      <Card>
        <CardHeader>
          <CardTitle>Cifrado automatico</CardTitle>
          <CardDescription>Carpetas cuyo contenido se cifra al cerrarse cada archivo</CardDescription>
        </CardHeader>
        <CardContent>
          <StringListInput
            label="Carpetas confidenciales"
            placeholder="D:\Compartido\Contabilidad"
            values={config.encryption.confidential_paths}
            onChange={(confidential_paths) => patch('encryption', { confidential_paths })}
            validate={validatePath}
            disabled={!canEdit}
          />
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- Monitoreo */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Monitoreo invasivo</CardTitle>
              <CardDescription>Requiere autorizacion firmada — Ley 1581 de 2012</CardDescription>
            </div>
            <Badge tone={consentSigned ? 'success' : 'warning'}>
              {consentSigned ? 'Autorizado' : 'Bloqueado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!consentSigned ? (
            <Callout tone="warning" title="Sin autorizacion de tratamiento de datos">
              Estos modulos quedan bloqueados hasta registrar la autorizacion firmada de
              sus trabajadores en Administracion → Organizacion. Aunque se fuerce desde la
              interfaz, la base de datos rechaza el guardado.
            </Callout>
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.monitoring.window_titles}
              onChange={(e) => patch('monitoring', { window_titles: e.target.checked })}
              disabled={!canEdit || !consentSigned}
              className="mt-1"
            />
            <span className={!consentSigned ? 'opacity-50' : undefined}>
              <span className="inline-flex items-center gap-1">
                Registrar titulos de ventana
                {!consentSigned ? <Lock className="h-3 w-3" aria-hidden /> : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                El titulo de una ventana suele contener el nombre del documento abierto:
                es dato personal del trabajador.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.monitoring.screenshots}
              onChange={(e) => patch('monitoring', { screenshots: e.target.checked })}
              disabled={!canEdit || !consentSigned}
              className="mt-1"
            />
            <span className={!consentSigned ? 'opacity-50' : undefined}>
              <span className="inline-flex items-center gap-1">
                Captura de pantalla por evento
                {!consentSigned ? <Lock className="h-3 w-3" aria-hidden /> : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                Solo ante eventos concretos (USB no autorizado, copia de archivo marcado),
                nunca de forma continua.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <PolicySimulator config={config} endpoints={endpoints} />

      {canEdit ? (
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button onClick={save} disabled={pending}>
            {pending ? 'Guardando…' : isNew ? 'Crear perfil' : 'Guardar cambios'}
          </Button>
          <FormError>{error}</FormError>
        </div>
      ) : (
        <Callout tone="neutral">
          Su rol permite consultar las politicas pero no modificarlas.
        </Callout>
      )}
    </div>
  )
}
