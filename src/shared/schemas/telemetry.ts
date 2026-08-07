import { z } from 'zod'

/**
 * CONTRATO DE TELEMETRIA — consola <-> agente de endpoint
 * ============================================================================
 *
 * Este archivo es la especificacion normativa del campo `payload` de
 * activity_events. El agente Go (repo nortis-agent) debe producir exactamente
 * estas formas; la consola las valida aqui antes de persistir nada.
 *
 * Por que la validacion vive del lado de la consola y no solo del agente: el
 * agente corre en la maquina del cliente, fuera de nuestro control. Un agente
 * modificado, con una version vieja o directamente suplantado puede enviar
 * cualquier cosa. La API es la frontera de confianza, y todo lo que cruza se
 * valida (requisito A.6.6).
 *
 * REGLA QUE NO SE PUEDE ROMPER: aqui nunca entra CONTENIDO. Se registran rutas,
 * dominios, nombres de proceso y tamaños — nunca el texto de un archivo, el
 * cuerpo de un correo o lo que el usuario copio al portapapeles. Nortis prueba
 * QUE ocurrio un movimiento de informacion, no reproduce la informacion. Si esto
 * se relaja, la base de datos pasa a ser el mayor deposito de datos sensibles
 * del cliente y el producto se convierte en el riesgo que dice mitigar.
 *
 * Compatibilidad: los objetos son `.passthrough()` — un agente mas nuevo puede
 * enviar campos extra sin que la consola los rechace. Al reves tambien funciona:
 * los campos opcionales permiten que un agente viejo siga reportando.
 */

/** Ruta de archivo en Windows. Se acota el largo para frenar payloads absurdos. */
const filePath = z.string().min(1).max(1024)

/** Nombre de proceso, sin ruta: "chrome.exe". */
const processName = z.string().min(1).max(255)

const fileEventPayload = z
  .object({
    path: filePath,
    /** Ruta anterior en un renombrado o movimiento. */
    previous_path: filePath.optional(),
    size_bytes: z.number().int().nonnegative().optional(),
    /** SHA-256 del contenido. Identifica el archivo sin revelarlo. */
    content_hash: z.string().length(64).optional(),
    extension: z.string().max(32).optional(),
    process: processName.optional(),
    user: z.string().max(255).optional(),
    /** El destino era un volumen extraible: señal fuerte de fuga por USB. */
    is_removable: z.boolean().optional(),
  })
  .passthrough()

const appEventPayload = z
  .object({
    app: processName,
    /** Ruta del ejecutable: distingue un binario legitimo de uno suplantado. */
    executable_path: filePath.optional(),
    /**
     * Categoria que asigna el agente (navegador, ofimatica, desarrollo…).
     * Alimenta el reporte de uso por categoria de software.
     */
    category: z.string().max(64).optional(),
    duration_seconds: z.number().int().nonnegative().optional(),
    user: z.string().max(255).optional(),
  })
  .passthrough()

/**
 * Titulo de la ventana activa.
 *
 * `title` SOLO puede venir si el tenant tiene consentimiento firmado. El agente
 * consulta ese flag antes de activar el modulo, pero la consola no confia en
 * ello: el Route Handler de ingesta debe volver a comprobarlo y descartar el
 * campo si falta la autorizacion. Un titulo de ventana suele contener el nombre
 * del documento abierto, y eso ya es dato personal.
 */
const windowFocusPayload = z
  .object({
    app: processName,
    title: z.string().max(512).optional(),
    duration_seconds: z.number().int().nonnegative().optional(),
    user: z.string().max(255).optional(),
  })
  .passthrough()

const webVisitPayload = z
  .object({
    /** Solo el host. La URL completa lleva identificadores y tokens en la query. */
    domain: z.string().min(1).max(255),
    /** Ruta sin query string, si la politica del tenant lo habilita. */
    path: z.string().max(512).optional(),
    browser: processName.optional(),
    category: z.string().max(64).optional(),
    duration_seconds: z.number().int().nonnegative().optional(),
    /** Bloqueado por politica en el propio endpoint. */
    blocked: z.boolean().optional(),
    user: z.string().max(255).optional(),
  })
  .passthrough()

const usbConnectedPayload = z
  .object({
    vendor_id: z.string().max(16).optional(),
    product_id: z.string().max(16).optional(),
    /** Serial del dispositivo: la clave de las listas blancas por serial. */
    serial: z.string().max(255).optional(),
    label: z.string().max(255).optional(),
    capacity_bytes: z.number().int().nonnegative().optional(),
    /** Que hizo el agente: allow | read_only | block. */
    enforcement: z.enum(['allow', 'read_only', 'block']).optional(),
    user: z.string().max(255).optional(),
  })
  .passthrough()

/**
 * Copia al portapapeles.
 *
 * Se registra el tamaño y las aplicaciones de origen y destino, NUNCA lo
 * copiado. Saber que salieron 40 KB de la app de nomina hacia el navegador es
 * suficiente para abrir un incidente; guardar esos 40 KB convertiria a Nortis en
 * un registrador de teclas con base de datos.
 */
const clipboardPayload = z
  .object({
    source_app: processName.optional(),
    target_app: processName.optional(),
    bytes: z.number().int().nonnegative().optional(),
    format: z.enum(['text', 'image', 'file_list', 'other']).optional(),
    enforcement: z.enum(['allow', 'alert', 'block']).optional(),
    user: z.string().max(255).optional(),
  })
  .passthrough()

const printJobPayload = z
  .object({
    printer: z.string().max(255).optional(),
    /** Nombre del documento, no su contenido. */
    document: z.string().max(512).optional(),
    pages: z.number().int().nonnegative().optional(),
    enforcement: z.enum(['allow', 'log', 'block']).optional(),
    user: z.string().max(255).optional(),
  })
  .passthrough()

const sessionPayload = z
  .object({
    user: z.string().max(255).optional(),
    session_type: z.enum(['console', 'remote', 'unlock']).optional(),
    idle_seconds: z.number().int().nonnegative().optional(),
  })
  .passthrough()

/** Payload esperado para cada event_type. */
export const TELEMETRY_PAYLOADS = {
  app_open: appEventPayload,
  file_created: fileEventPayload,
  file_modified: fileEventPayload,
  file_deleted: fileEventPayload,
  usb_connected: usbConnectedPayload,
  web_visit: webVisitPayload,
  clipboard_copy: clipboardPayload,
  print_job: printJobPayload,
  window_focus: windowFocusPayload,
  logon: sessionPayload,
  logoff: sessionPayload,
  idle_start: sessionPayload,
  idle_end: sessionPayload,
} as const

export type TelemetryEventType = keyof typeof TELEMETRY_PAYLOADS

/**
 * Valida un evento contra el esquema que corresponde a su tipo.
 * Devuelve el payload saneado o el motivo del rechazo — el Route Handler de
 * ingesta debe descartar el evento invalido, no el lote completo: un solo
 * evento mal formado no puede tumbar la sincronizacion de todo un equipo.
 */
export function validateTelemetryPayload(
  eventType: string,
  payload: unknown
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  const schema = TELEMETRY_PAYLOADS[eventType as TelemetryEventType]

  if (!schema) {
    return { ok: false, reason: `event_type desconocido: ${eventType}` }
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    return { ok: false, reason: result.error.issues[0]?.message ?? 'payload invalido' }
  }

  return { ok: true, payload: result.data as Record<string, unknown> }
}

/* -------------------------------------------------------------------------- */
/* Etiquetas para la interfaz                                                  */
/* -------------------------------------------------------------------------- */

export const EVENT_TYPE_LABEL: Record<TelemetryEventType, string> = {
  app_open: 'Aplicacion abierta',
  file_created: 'Archivo creado',
  file_modified: 'Archivo modificado',
  file_deleted: 'Archivo eliminado',
  usb_connected: 'USB conectado',
  web_visit: 'Sitio visitado',
  clipboard_copy: 'Copia al portapapeles',
  print_job: 'Impresion',
  window_focus: 'Ventana activa',
  logon: 'Inicio de sesion',
  logoff: 'Cierre de sesion',
  idle_start: 'Inicio de inactividad',
  idle_end: 'Fin de inactividad',
}

/** Eventos que representan movimiento de informacion: los que importan en DLP. */
export const EXFILTRATION_EVENT_TYPES: TelemetryEventType[] = [
  'file_created',
  'file_modified',
  'file_deleted',
  'usb_connected',
  'clipboard_copy',
  'print_job',
]
