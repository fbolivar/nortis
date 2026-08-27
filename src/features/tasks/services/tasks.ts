'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { signTask, type TaskKind } from '@/shared/lib/agent-signing'

/**
 * Emision de tareas de ejecucion remota. La FIRMA se calcula aqui, en el
 * servidor (unica parte con la clave privada); la AUTORIDAD (admin + MFA + que el
 * equipo sea del tenant) la impone el RPC `issue_agent_task`. Asi el secreto no
 * toca el navegador y la autorizacion no depende del cliente.
 */

// Plazo para que una tarea firmada se aplique. Pasado esto el agente la rechaza
// aunque la firma sea valida: acota la reejecucion de una tarea copiada.
const TTL_SECONDS = 60 * 60 * 6

export type IssueResult = {
  results: { endpointId: string; taskId?: string; error?: string }[]
}

/**
 * Firma y emite una tarea a cada equipo. La firma ata cada tarea a su
 * `endpoint_id` (una tarea firmada para A no vale en B) y el payload firmado
 * lleva la caducidad. Devuelve el resultado por equipo.
 */
async function issue(
  endpointIds: string[],
  kind: TaskKind,
  fields: Record<string, unknown>,
  notBefore?: Date,
): Promise<IssueResult> {
  // La caducidad se mide desde la hora PROGRAMADA, no desde ahora: una tarea
  // agendada para las 2am con una firma que caduca en 6h seguiria vigente al
  // ejecutarse. Sin programacion, `not_before` es ahora.
  const startEpoch = Math.floor((notBefore?.getTime() ?? Date.now()) / 1000)
  const notAfter = startEpoch + TTL_SECONDS
  const expiresAtIso = new Date(notAfter * 1000).toISOString()
  const notBeforeIso = new Date(startEpoch * 1000).toISOString()
  const supabase = await createClient()

  const results = await Promise.all(
    endpointIds.map(async (endpointId) => {
      const payloadText = JSON.stringify({ ...fields, not_after: notAfter })
      let signature: string
      try {
        signature = signTask(endpointId, kind, payloadText)
      } catch (e) {
        return { endpointId, error: e instanceof Error ? e.message : 'No se pudo firmar' }
      }

      const { data, error } = await supabase.rpc('issue_agent_task', {
        p_endpoint_id: endpointId,
        p_kind: kind,
        p_payload: payloadText,
        p_expires_at: expiresAtIso,
        p_signature: signature,
        p_not_before: notBeforeIso,
      })
      if (error) return { endpointId, error: error.message }
      return { endpointId, taskId: data as string }
    }),
  )

  return { results }
}

/**
 * Interpreta la hora programada del formulario (datetime-local, hora del equipo
 * del admin). Devuelve undefined si no hay o no es valida (se ejecuta enseguida),
 * y rechaza una hora en el pasado.
 */
function parseSchedule(scheduleAt?: string): { at?: Date; error?: string } {
  if (!scheduleAt) return {}
  const at = new Date(scheduleAt)
  if (Number.isNaN(at.getTime())) return { error: 'Fecha programada invalida' }
  if (at.getTime() < Date.now() - 60_000) return { error: 'La hora programada esta en el pasado' }
  return { at }
}

const endpointsSchema = z.array(z.string().uuid()).min(1, 'Seleccione al menos un equipo')
const sha256Schema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/, 'sha256 invalido (64 hex)')
const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'La URL debe ser https')

/* ----------------------------------------------------------- install_msi --- */

const installMsiSchema = z.object({
  endpointIds: endpointsSchema,
  url: httpsUrl,
  sha256: sha256Schema,
  args: z.string().max(1000).optional(),
  scheduleAt: z.string().optional(),
})
export type IssueInstallMsiInput = z.input<typeof installMsiSchema>

export async function issueInstallMsi(input: IssueInstallMsiInput): Promise<IssueResult> {
  const parsed = installMsiSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  const { endpointIds, url, sha256, args, scheduleAt } = parsed.data
  const sched = parseSchedule(scheduleAt)
  if (sched.error) return fail(endpointIds, sched.error)
  return issue(endpointIds, 'install_msi', { url, sha256, args: args ?? '' }, sched.at)
}

/* ------------------------------------------------------------- push_file --- */

const pushFileSchema = z.object({
  endpointIds: endpointsSchema,
  url: httpsUrl,
  sha256: sha256Schema,
  // Ruta destino absoluta de Windows (C:\... o \\servidor\...). El agente vuelve
  // a validar que sea absoluta y sin "..".
  destPath: z
    .string()
    .trim()
    .min(3, 'Ruta destino requerida')
    .max(512)
    .refine((p) => /^[a-zA-Z]:\\/.test(p) || p.startsWith('\\\\'), 'Debe ser una ruta absoluta de Windows')
    .refine((p) => !p.includes('..'), 'La ruta no puede contener ".."'),
  scheduleAt: z.string().optional(),
})
export type IssuePushFileInput = z.input<typeof pushFileSchema>

export async function issuePushFile(input: IssuePushFileInput): Promise<IssueResult> {
  const parsed = pushFileSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  const { endpointIds, url, sha256, destPath, scheduleAt } = parsed.data
  const sched = parseSchedule(scheduleAt)
  if (sched.error) return fail(endpointIds, sched.error)
  return issue(endpointIds, 'push_file', { url, sha256, dest_path: destPath }, sched.at)
}

/* --------------------------------------------------------------- restart --- */

const restartSchema = z.object({
  endpointIds: endpointsSchema,
  scheduleAt: z.string().optional(),
})
export type IssueRestartInput = z.input<typeof restartSchema>

export async function issueRestart(input: IssueRestartInput): Promise<IssueResult> {
  const parsed = restartSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  const sched = parseSchedule(parsed.data.scheduleAt)
  if (sched.error) return fail(parsed.data.endpointIds, sched.error)
  return issue(parsed.data.endpointIds, 'restart', {}, sched.at)
}

/* ------------------------------------------------------------ run_script --- */

const runScriptSchema = z.object({
  endpointIds: endpointsSchema,
  interpreter: z.enum(['powershell', 'cmd']),
  // El script va firmado; el limite es solo para no encargar algo desmesurado.
  script: z.string().trim().min(1, 'El script no puede estar vacio').max(100_000),
  scheduleAt: z.string().optional(),
})
export type IssueRunScriptInput = z.input<typeof runScriptSchema>

export async function issueRunScript(input: IssueRunScriptInput): Promise<IssueResult> {
  const parsed = runScriptSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  const { endpointIds, interpreter, script, scheduleAt } = parsed.data
  const sched = parseSchedule(scheduleAt)
  if (sched.error) return fail(endpointIds, sched.error)
  return issue(endpointIds, 'run_script', { interpreter, script }, sched.at)
}

/* --------------------------------------------------------------- lock ------ */

const lockSchema = z.object({ endpointIds: endpointsSchema })
export type IssueLockInput = z.input<typeof lockSchema>

export async function issueLock(input: IssueLockInput): Promise<IssueResult> {
  const parsed = lockSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  // Sin programacion: bloquear es una accion inmediata.
  return issue(parsed.data.endpointIds, 'lock', {})
}

/* --------------------------------------------------------------- wipe ------ */

const wipeSchema = z.object({
  endpointIds: endpointsSchema,
  // Confirmacion explicita: el cliente debe enviar exactamente "BORRAR". No es la
  // autoridad (esa la da el RPC con admin+MFA), es una barrera contra el clic
  // accidental sobre una accion irreversible.
  confirm: z.string().refine((v) => v === 'BORRAR', 'Escriba BORRAR para confirmar'),
})
export type IssueWipeInput = z.input<typeof wipeSchema>

export async function issueWipe(input: IssueWipeInput): Promise<IssueResult> {
  const parsed = wipeSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  return issue(parsed.data.endpointIds, 'wipe', {})
}

/* ----------------------------------------------------------- screenshot ---- */

const screenshotSchema = z.object({ endpointIds: endpointsSchema })
export type IssueScreenshotInput = z.input<typeof screenshotSchema>

export async function issueScreenshot(input: IssueScreenshotInput): Promise<IssueResult> {
  const parsed = screenshotSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  return issue(parsed.data.endpointIds, 'screenshot', {})
}

/* -------------------------------------------------------------- message ---- */

const messageSchema = z.object({
  endpointIds: endpointsSchema,
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, 'El mensaje no puede estar vacio').max(2000),
})
export type IssueMessageInput = z.input<typeof messageSchema>

export async function issueMessage(input: IssueMessageInput): Promise<IssueResult> {
  const parsed = messageSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  const { endpointIds, title, body } = parsed.data
  return issue(endpointIds, 'message', { title: title ?? '', body })
}

/* ----------------------------------------------------------------- kill ---- */

const killSchema = z.object({
  endpointIds: endpointsSchema,
  name: z
    .string()
    .trim()
    .min(1, 'Falta el nombre del proceso')
    .max(255)
    .refine((n) => /\.exe$/i.test(n), 'Nombre de ejecutable, ej: anydesk.exe'),
})
export type IssueKillInput = z.input<typeof killSchema>

export async function issueKill(input: IssueKillInput): Promise<IssueResult> {
  const parsed = killSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  return issue(parsed.data.endpointIds, 'kill', { name: parsed.data.name })
}

/* ------------------------------------------------------------ uninstall ---- */

const uninstallSchema = z.object({
  endpointIds: endpointsSchema,
  name: z.string().trim().min(1, 'Falta el nombre del programa').max(300),
})
export type IssueUninstallInput = z.input<typeof uninstallSchema>

export async function issueUninstall(input: IssueUninstallInput): Promise<IssueResult> {
  const parsed = uninstallSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  return issue(parsed.data.endpointIds, 'uninstall', { name: parsed.data.name })
}

/* ----------------------------------------------------------------- wake ---- */

const wakeSchema = z.object({
  // El equipo que EJECUTA (relay, en linea) y la MAC del equipo a encender.
  endpointIds: endpointsSchema,
  mac: z
    .string()
    .trim()
    .refine((m) => /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(m), 'MAC invalida (ej: 7c:57:58:16:e4:8c)'),
})
export type IssueWakeInput = z.input<typeof wakeSchema>

export async function issueWake(input: IssueWakeInput): Promise<IssueResult> {
  const parsed = wakeSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  return issue(parsed.data.endpointIds, 'wake', { mac: parsed.data.mac })
}

/* -------------------------------------------------------- schedule_script -- */

const scheduleScriptSchema = z
  .object({
    endpointIds: endpointsSchema,
    id: z.string().trim().min(1).max(80),
    interpreter: z.enum(['powershell', 'cmd']),
    script: z.string().max(100_000).default(''),
    // 0 = eliminar la tarea programada con ese id. Cualquier otro valor debe ser
    // >= 5 minutos para no saturar el equipo.
    everyMinutes: z.coerce.number().int().min(0).max(43_200),
  })
  .refine((v) => v.everyMinutes === 0 || v.everyMinutes >= 5, {
    message: 'Minimo cada 5 minutos',
    path: ['everyMinutes'],
  })
  .refine((v) => v.everyMinutes === 0 || v.script.trim().length > 0, {
    message: 'El script no puede estar vacio',
    path: ['script'],
  })
export type IssueScheduleScriptInput = z.input<typeof scheduleScriptSchema>

export async function issueScheduleScript(input: IssueScheduleScriptInput): Promise<IssueResult> {
  const parsed = scheduleScriptSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  const { endpointIds, id, interpreter, script, everyMinutes } = parsed.data
  return issue(endpointIds, 'schedule_script', {
    id,
    interpreter,
    script,
    every_minutes: everyMinutes,
  })
}

/* -------------------------------------------------------------- scan_av ---- */

const scanSchema = z.object({
  endpointIds: endpointsSchema,
  type: z.enum(['quick', 'full']),
})
export type IssueScanInput = z.input<typeof scanSchema>

export async function issueScan(input: IssueScanInput): Promise<IssueResult> {
  const parsed = scanSchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  return issue(parsed.data.endpointIds, 'scan_av', { type: parsed.data.type })
}

/* ------------------------------------------------------ refresh_inventory -- */

const refreshInventorySchema = z.object({ endpointIds: endpointsSchema })
export type IssueRefreshInventoryInput = z.input<typeof refreshInventorySchema>

export async function issueRefreshInventory(
  input: IssueRefreshInventoryInput
): Promise<IssueResult> {
  const parsed = refreshInventorySchema.safeParse(input)
  if (!parsed.success) return fail(input?.endpointIds, parsed.error.issues[0]?.message)
  return issue(parsed.data.endpointIds, 'refresh_inventory', {})
}

/** Resultado de error homogeneo por equipo cuando la validacion falla. */
function fail(endpointIds: string[] | undefined, message?: string): IssueResult {
  const msg = message ?? 'Datos invalidos'
  return { results: (endpointIds ?? []).map((endpointId) => ({ endpointId, error: msg })) }
}
