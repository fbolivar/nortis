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

/** Resultado de error homogeneo por equipo cuando la validacion falla. */
function fail(endpointIds: string[] | undefined, message?: string): IssueResult {
  const msg = message ?? 'Datos invalidos'
  return { results: (endpointIds ?? []).map((endpointId) => ({ endpointId, error: msg })) }
}
