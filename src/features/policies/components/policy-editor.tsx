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
  APLICACION_POR_CANAL,
  NIVEL_LABEL,
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
  processExe,
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
const validateProcessExe = makeValidator(processExe)

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
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-muted px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary-subtle"
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
  classes = [],
}: {
  profile: SecurityProfile | null
  initialConfig: PolicyConfig
  endpoints: { id: string; hostname: string; assigned_profile_id: string | null }[]
  consentSigned: boolean
  canEdit: boolean
  /** Clases definidas en Clasificacion; alimentan las casillas de "clase vigilada". */
  classes?: { name: string; sensitive: boolean }[]
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Guardado de archivos</CardTitle>
              <CardDescription>Donde puede guardar el usuario y que extensiones se impiden</CardDescription>
            </div>
            <Aplicacion canal="storage" />
          </div>
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

      {/* ----------------------------------------------- Clasificacion de datos */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Clasificacion de datos</CardTitle>
              <CardDescription>
                Abre un incidente cuando un archivo de estas clases se crea o modifica, aunque la
                carpeta y la extension estuvieran permitidas. Se vigila el dato, no la carpeta.
              </CardDescription>
            </div>
            <Aplicacion canal="storage" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {classes.length === 0 ? (
            <Callout tone="info" title="Aun no hay clases definidas">
              Cree clases en <strong>Clasificacion</strong> (extension, palabras de ruta o patrones
              de contenido) y apareceran aqui para vigilarlas.
            </Callout>
          ) : (
            <fieldset>
              <legend className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Clases vigiladas
              </legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {classes.map((c) => {
                  const checked = config.classification.watched.some(
                    (w) => w.toLowerCase() === c.name.toLowerCase()
                  )
                  return (
                    <label
                      key={c.name}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-muted px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary-subtle"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patch('classification', {
                            watched: e.target.checked
                              ? [...config.classification.watched, c.name]
                              : config.classification.watched.filter(
                                  (w) => w.toLowerCase() !== c.name.toLowerCase()
                                ),
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm">
                          {c.name}
                          {c.sensitive ? (
                            <span className="rounded bg-critical-subtle px-1.5 py-0.5 text-[0.625rem] font-medium text-critical">
                              Sensible
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {c.sensitive
                            ? 'Sus incidentes entran con severidad elevada.'
                            : 'Se registra el movimiento del dato.'}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {config.classification.watched.length > 0 ? (
            <ModeSelector
              legend="Que hacer con las clases vigiladas"
              value={config.classification.mode}
              options={['alert', 'quarantine'] as const}
              labels={{ alert: 'Alertar', quarantine: 'Retirar a cuarentena' }}
              help={{
                alert:
                  'Se abre un incidente por cada archivo de una clase vigilada. El archivo se queda donde esta.',
                quarantine:
                  'El agente RETIRA el archivo a una carpeta protegida en el equipo (recuperable desde el incidente) y abre el incidente. No evita la escritura inicial; la deshace enseguida. Aplica aunque el archivo este en carpeta permitida.',
              }}
              onChange={(mode) => patch('classification', { mode })}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* -------------------------------------------------- Control de apps */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Control de aplicaciones</CardTitle>
              <CardDescription>
                Programas cuyo uso se vigila o se impide. Se identifican por el nombre del
                ejecutable (p. ej. <span className="font-mono">anydesk.exe</span>).
              </CardDescription>
            </div>
            <Aplicacion canal="apps" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModeSelector
            legend="Que hacer con las aplicaciones de la lista"
            value={config.apps.mode}
            options={['allow', 'alert', 'block'] as const}
            labels={{ allow: 'Permitir', alert: 'Alertar', block: 'Bloquear' }}
            help={{
              allow: 'No se controlan las aplicaciones.',
              alert: 'Se abre un incidente cuando alguien abre un programa de la lista; el programa sigue funcionando.',
              block:
                'Ademas de abrir el incidente, el agente TERMINA el proceso en el siguiente sondeo (hasta ~1 min). Mitiga, no previene: el programa alcanza a arrancar.',
            }}
            onChange={(mode) => patch('apps', { mode })}
          />
          {config.apps.mode !== 'allow' ? (
            <StringListInput
              label="Aplicaciones bloqueadas"
              help="Nombre del ejecutable con .exe. Ej: anydesk.exe, utorrent.exe, teamviewer.exe."
              placeholder="anydesk.exe"
              values={config.apps.blocklist}
              onChange={(blocklist) => patch('apps', { blocklist })}
              validate={validateProcessExe}
              disabled={!canEdit}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- USB */}
      <Card>
        <CardHeader>
          <CardTitle>Dispositivos USB</CardTitle>
          <Aplicacion canal="usb" />
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
          <Aplicacion canal="web" />
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
          <Aplicacion canal="clipboard" />
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
          <Aplicacion canal="printing" />
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

      {/* ------------------------------------------------------------- Sesion */}
      <Card>
        <CardHeader>
          <CardTitle>Bloqueo de sesion</CardTitle>
          <CardDescription>
            Windows bloquea la sesion tras N minutos de inactividad. Lo impone el propio
            sistema operativo, asi que funciona igual en consola y por RDP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="lock-min">Minutos de inactividad (0 = no gestionar)</Label>
          <Input
            id="lock-min"
            type="number"
            min={0}
            max={9999}
            value={config.session.lock_after_minutes}
            onChange={(e) =>
              patch('session', { lock_after_minutes: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
            }
            disabled={!canEdit}
            className="max-w-[10rem]"
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------- Control por horario */}
      <Card>
        <CardHeader>
          <CardTitle>Control por horario</CardTitle>
          <CardDescription>
            Fuera de la franja laboral, el agente bloquea la sesion. El usuario no puede usar el
            equipo fuera de horario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.work_hours.enabled}
              onChange={(e) => patch('work_hours', { enabled: e.target.checked })}
              disabled={!canEdit}
              className="mt-1"
            />
            <span>Restringir el uso a la franja laboral</span>
          </label>
          {config.work_hours.enabled ? (
            <div className="space-y-3">
              <div>
                <Label>Dias laborables</Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[
                    { d: 1, l: 'Lun' },
                    { d: 2, l: 'Mar' },
                    { d: 3, l: 'Mie' },
                    { d: 4, l: 'Jue' },
                    { d: 5, l: 'Vie' },
                    { d: 6, l: 'Sab' },
                    { d: 7, l: 'Dom' },
                  ].map(({ d, l }) => {
                    const on = config.work_hours.days.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          patch('work_hours', {
                            days: on
                              ? config.work_hours.days.filter((x) => x !== d)
                              : [...config.work_hours.days, d].sort((a, b) => a - b),
                          })
                        }
                        className={
                          'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
                          (on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-surface-muted text-muted-foreground hover:border-primary/40')
                        }
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="wh-start">Desde</Label>
                  <Input
                    id="wh-start"
                    type="time"
                    value={config.work_hours.start}
                    onChange={(e) => patch('work_hours', { start: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="wh-end">Hasta</Label>
                  <Input
                    id="wh-end"
                    type="time"
                    value={config.work_hours.end}
                    onChange={(e) => patch('work_hours', { end: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------- Redes */}
      <Card>
        <CardHeader>
          <CardTitle>Bloqueo de redes</CardTitle>
          <CardDescription>
            El cableado nunca se bloquea (es el enlace de administracion). WiFi y datos
            moviles se restringen solo cuando hay cable activo: si el cable cae, Windows
            los reconecta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.network.minimize_when_wired}
              onChange={(e) => patch('network', { minimize_when_wired: e.target.checked })}
              disabled={!canEdit}
              className="mt-1"
            />
            <span>
              Desconectar WiFi y datos moviles cuando hay cable
              <span className="block text-xs text-muted-foreground">
                Solo con enlace Ethernet activo. No deja el equipo incomunicado.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.network.block_non_domain}
              onChange={(e) => patch('network', { block_non_domain: e.target.checked })}
              disabled={!canEdit}
              className="mt-1"
            />
            <span>
              Bloquear WiFi fuera del dominio de la empresa
              <span className="block text-xs text-muted-foreground">
                Impide conectarse a redes inalambricas ajenas a la red corporativa.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.network.block_bluetooth}
              onChange={(e) => patch('network', { block_bluetooth: e.target.checked })}
              disabled={!canEdit}
              className="mt-1"
            />
            <span>
              Deshabilitar Bluetooth
              <span className="block text-xs text-muted-foreground">
                Apaga el servicio de Bluetooth del equipo. Se restaura al retirar el control.
              </span>
            </span>
          </label>
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

/**
 * Etiqueta que dice si un control PREVIENE de verdad o solo deja constancia.
 *
 * Existe porque el editor ofrece modos que el agente no puede cumplir. El agente
 * corre en modo usuario —meterlo en el kernel exige un driver con certificado EV
 * y atestacion de Microsoft, y un fallo ahi es un pantallazo azul en el equipo
 * del cliente—, y desde ahi impedir un guardado es imposible.
 *
 * Sin este aviso, un administrador configura "bloquear", ve el equipo cubierto
 * en el panel y confia en una proteccion que no existe. Se enterara el dia que
 * alguien se lleve la informacion: el peor momento imaginable para descubrirlo.
 *
 * El tono NO usa rojo. `solo_registra` no es un error ni una alerta de
 * seguridad: es informacion sobre el alcance real de la herramienta, y pintarla
 * de rojo la mezclaria con las severidades de incidente, que en esta consola
 * significan otra cosa.
 */
function Aplicacion({ canal }: { canal: keyof typeof APLICACION_POR_CANAL }) {
  const { nivel, nota } = APLICACION_POR_CANAL[canal]

  const tono = nivel === 'previene' ? 'success' : nivel === 'mitiga' ? 'warning' : 'neutral'

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Badge tone={tono}>{NIVEL_LABEL[nivel]}</Badge>
      {nota ? <span className="text-xs text-muted-foreground">{nota}</span> : null}
    </div>
  )
}
