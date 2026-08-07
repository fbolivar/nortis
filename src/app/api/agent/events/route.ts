import { NextResponse } from 'next/server'
import { withAgentRequest, mapPostgresError } from '@/shared/lib/agent-auth'
import { ingestRequestSchema } from '@/shared/schemas/agent-api'
import { validateTelemetryPayload } from '@/shared/schemas/telemetry'
import type { Json } from '@/shared/types/database'

/**
 * POST /api/agent/events
 *
 * Ingesta de telemetria por lotes.
 *
 * UN EVENTO INVALIDO NO TUMBA EL LOTE. Se descarta, se cuenta y se informa del
 * motivo. Lo contrario significaria que un solo evento mal formado —por un bug
 * del agente en una version concreta— bloquea la sincronizacion de ese equipo
 * indefinidamente, y el equipo desaparece del panel sin que nadie sepa por que.
 */
export async function POST(request: Request) {
  return withAgentRequest(request, ingestRequestSchema, async (body, { credential, client }) => {
    // Validacion por evento contra el contrato de telemetria. Los que no encajan
    // se descartan aqui con su motivo; la base repite las comprobaciones
    // criticas porque este handler es evitable llamando al RPC directamente.
    const accepted: typeof body.events = []
    const rejected: { index: number; reason: string }[] = []

    body.events.forEach((event, index) => {
      const result = validateTelemetryPayload(event.event_type, event.payload ?? {})
      if (result.ok) {
        accepted.push({ ...event, payload: result.payload })
      } else {
        rejected.push({ index, reason: result.reason })
      }
    })

    // NO se hace cortocircuito cuando no queda ningun evento valido. La primera
    // version devolvia 200 sin llamar al RPC, y eso significaba que un lote
    // vacio se saltaba TRES controles a la vez: la validez de la credencial, la
    // pertenencia del equipo al tenant y —lo peor— el consumo de cupo del
    // limite de tasa. Se podia martillear la ingesta indefinidamente sin coste.
    // La llamada se hace siempre; el RPC acepta un arreglo vacio sin problema.
    const { data, error } = await client.rpc('agent_ingest', {
      p_credential: credential,
      p_endpoint_id: body.endpoint_id,
      // El cast es necesario porque `Json` no admite `unknown` en sus valores,
      // y el payload ya paso por el esquema de telemetria: lo que va aqui es
      // JSON serializable por construccion.
      p_events: accepted as unknown as Json,
    })

    if (error) return mapPostgresError(error)

    const row = Array.isArray(data) ? data[0] : data

    return NextResponse.json({
      // Los duplicados van DENTRO de `accepted`: el agente usa este numero para
      // purgar su cola, y devolverle un reenvio como rechazado lo dejaria
      // reintentando el mismo evento para siempre.
      accepted: row?.accepted ?? 0,
      // Se suman los descartados por Zod y los descartados por la base (fechas
      // fuera de la ventana de retencion). El agente necesita el total real para
      // no dar por enviados eventos que nunca entraron.
      rejected: (row?.rejected ?? 0) + rejected.length,
      // Informativo, no accionable: un valor alto y sostenido significa que el
      // agente no esta purgando bien su cola tras confirmar un lote, y sin este
      // dato ese fallo es invisible desde fuera.
      duplicates: row?.duplicates ?? 0,
      details: rejected.length ? rejected : undefined,
    })
  })
}
