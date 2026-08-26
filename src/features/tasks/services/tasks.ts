'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { signTask } from '@/shared/lib/agent-signing'

/**
 * Emision de tareas de ejecucion remota. La FIRMA se calcula aqui, en el
 * servidor (unica parte con la clave privada); la AUTORIDAD (admin + MFA + que el
 * equipo sea del tenant) la impone el RPC `issue_agent_task`. Asi el secreto no
 * toca el navegador y la autorizacion no depende del cliente.
 */

// Plazo para que una tarea firmada se aplique. Pasado esto el agente la rechaza
// aunque la firma sea valida: acota la reejecucion de una tarea copiada.
const TTL_SECONDS = 60 * 60 * 6

const installMsiSchema = z.object({
  endpointIds: z.array(z.string().uuid()).min(1, 'Seleccione al menos un equipo'),
  // Solo HTTPS: el MSI se descarga en el equipo y su integridad la garantiza el
  // sha256, pero el canal tambien debe ser cifrado.
  url: z.string().url().refine((u) => u.startsWith('https://'), 'La URL debe ser https'),
  sha256: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-f0-9]{64}$/, 'sha256 invalido (64 hex)'),
  args: z.string().max(1000).optional(),
})

export type IssueInstallMsiInput = z.input<typeof installMsiSchema>

export type IssueResult = {
  results: { endpointId: string; taskId?: string; error?: string }[]
}

/**
 * Encarga la instalacion de un MSI en uno o varios equipos. Firma una tarea por
 * equipo —la firma ata cada tarea a su `endpoint_id`, para que no pueda
 * reejecutarse en otro— y devuelve el resultado por equipo.
 */
export async function issueInstallMsi(input: IssueInstallMsiInput): Promise<IssueResult> {
  const parsed = installMsiSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Datos invalidos'
    return { results: (input?.endpointIds ?? []).map((endpointId) => ({ endpointId, error: msg })) }
  }
  const { endpointIds, url, sha256, args } = parsed.data

  const notAfter = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const expiresAtIso = new Date(notAfter * 1000).toISOString()
  const supabase = await createClient()

  const results = await Promise.all(
    endpointIds.map(async (endpointId) => {
      // El payload firmado incluye la caducidad (`not_after`), que el agente
      // exige. Se guarda como texto exacto: es sobre esos bytes que se firma.
      const payloadText = JSON.stringify({ url, sha256, args: args ?? '', not_after: notAfter })
      let signature: string
      try {
        signature = signTask(endpointId, 'install_msi', payloadText)
      } catch (e) {
        return { endpointId, error: e instanceof Error ? e.message : 'No se pudo firmar' }
      }

      const { data, error } = await supabase.rpc('issue_agent_task', {
        p_endpoint_id: endpointId,
        p_kind: 'install_msi',
        p_payload: payloadText,
        p_expires_at: expiresAtIso,
        p_signature: signature,
      })
      if (error) return { endpointId, error: error.message }
      return { endpointId, taskId: data as string }
    }),
  )

  return { results }
}
