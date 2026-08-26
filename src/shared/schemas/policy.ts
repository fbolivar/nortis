import { z } from 'zod'

/**
 * CONTRATO DE POLITICA — consola <-> agente de endpoint
 * ============================================================================
 *
 * Es el otro extremo del contrato de telemetria: la consola escribe este objeto
 * en security_profiles.config y el agente Go lo descarga, lo cachea en disco y
 * lo aplica aunque pierda conectividad.
 *
 * VERSIONADO. `schema_version` vive en su propia columna, no aqui dentro. Un
 * agente que recibe una version mayor que la que entiende NO debe aplicar las
 * reglas a medias: sigue con la ultima politica conocida y reporta que esta
 * desactualizado. Aplicar la mitad de una politica de seguridad es peor que no
 * aplicarla, porque el panel diria que el equipo esta cubierto.
 *
 * TODO CAMPO ES OPCIONAL AL LEER. Un perfil guardado con la version 1 tiene que
 * seguir cargando cuando la version 3 haya añadido tres secciones mas; por eso
 * el parseo rellena con los valores por defecto en vez de fallar.
 */

export const POLICY_SCHEMA_VERSION = 1

/*
 * Los validadores de elemento se exportan uno a uno (no se extraen del arbol del
 * esquema con .shape/.element): asi el editor valida cada valor con EXACTAMENTE
 * la misma regla que el contrato, sin depender de la forma interna de Zod, que
 * cambia entre versiones mayores.
 */

/** Modo de un canal que solo admite permitir o bloquear. */
const enforcementMode = z.enum(['allow', 'read_only', 'block'])
const clipboardMode = z.enum(['allow', 'alert', 'block'])
const printingMode = z.enum(['allow', 'log', 'block'])

/**
 * Ruta de carpeta en Windows. Se normaliza sin barra final para que
 * "D:\Compartido" y "D:\Compartido\" no se traten como reglas distintas — el
 * agente compara por prefijo y esa diferencia haria que una de las dos no
 * coincidiera nunca.
 */
export const folderPath = z
  .string()
  .trim()
  .min(2, 'Ruta demasiado corta')
  .max(512)
  .transform((v) => v.replace(/[\\/]+$/, ''))

export const extension = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^\.[a-z0-9]{1,10}$/, 'Debe empezar por punto, ej: .exe')

export const domain = z
  .string()
  .trim()
  .toLowerCase()
  // Sin protocolo ni ruta: el agente compara contra el host de la navegacion.
  .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/, 'Dominio no valido, ej: wetransfer.com')

export const processName = z
  .string()
  .trim()
  .min(1)
  .max(255)

/** Serial de dispositivo USB, como lo reporta SetupAPI. */
export const usbSerial = z.string().trim().min(1).max(255)

export const policyConfigSchema = z.object({
  storage: z
    .object({
      /**
       * Si esta vacio, NO se restringe el guardado. Una lista vacia significa
       * "sin restriccion", no "no se puede guardar en ningun lado": lo segundo
       * dejaria al usuario sin poder trabajar en cuanto alguien creara un perfil
       * sin terminar de configurarlo.
       */
      allowed_paths: z.array(folderPath).default([]),
      blocked_extensions: z.array(extension).default([]),
    })
    .default({ allowed_paths: [], blocked_extensions: [] }),

  usb: z
    .object({
      mode: enforcementMode.default('allow'),
      serial_allowlist: z.array(usbSerial).default([]),
    })
    .default({ mode: 'allow', serial_allowlist: [] }),

  web: z
    .object({
      blocked_domains: z.array(domain).default([]),
      /** Si tiene elementos, funciona como lista blanca: todo lo demas se bloquea. */
      allowed_domains: z.array(domain).default([]),
      block_webmail: z.boolean().default(false),
    })
    .default({ blocked_domains: [], allowed_domains: [], block_webmail: false }),

  clipboard: z
    .object({
      mode: clipboardMode.default('allow'),
      /**
       * Aplicaciones cuyo contenido se considera sensible (ERP, nomina). Con
       * modo 'alert' solo se generan incidentes desde estas; sin lista, el modo
       * aplica a todo.
       */
      protected_sources: z.array(processName).default([]),
    })
    .default({ mode: 'allow', protected_sources: [] }),

  printing: z.object({ mode: printingMode.default('allow') }).default({ mode: 'allow' }),

  encryption: z
    .object({ confidential_paths: z.array(folderPath).default([]) })
    .default({ confidential_paths: [] }),

  session: z
    .object({
      /**
       * Minutos de inactividad tras los que Windows bloquea la sesion. 0 = Nortis
       * no gestiona el bloqueo (no toca la configuracion del equipo). Lo impone el
       * propio SO via la directiva de inactividad, asi que funciona igual en
       * consola y por RDP.
       */
      lock_after_minutes: z.number().int().min(0).max(9999).default(0),
    })
    .default({ lock_after_minutes: 0 }),

  network: z
    .object({
      /**
       * WiFi/celular solo cuando hay cable: Windows desconecta las radios cuando
       * hay un enlace Ethernet activo, y las reconecta si el cable cae. El
       * cableado NUNCA se bloquea (es el enlace de gestion), asi que un equipo
       * remoto no se queda incomunicado.
       */
      minimize_when_wired: z.boolean().default(false),
      /** Bloquear WiFi que no sea de la red de dominio de la empresa. */
      block_non_domain: z.boolean().default(false),
      /** Deshabilitar el Bluetooth del equipo. */
      block_bluetooth: z.boolean().default(false),
    })
    .default({ minimize_when_wired: false, block_non_domain: false, block_bluetooth: false }),

  monitoring: z
    .object({
      /**
       * AMBOS requieren consentimiento firmado del tenant. La UI los bloquea y
       * un trigger de la base rechaza el guardado — la validacion de aqui no es
       * el control, es solo la primera de las tres capas.
       */
      window_titles: z.boolean().default(false),
      screenshots: z.boolean().default(false),
    })
    .default({ window_titles: false, screenshots: false }),
})

export type PolicyConfig = z.infer<typeof policyConfigSchema>

/** Politica en blanco: no restringe nada. Punto de partida de un perfil nuevo. */
export function emptyPolicyConfig(): PolicyConfig {
  return policyConfigSchema.parse({})
}

/**
 * Lee un config almacenado tolerando versiones anteriores y campos ausentes.
 * Nunca lanza: un perfil corrupto debe abrirse en el editor para poder
 * arreglarlo, no dejar la pantalla en blanco.
 */
export function parsePolicyConfig(raw: unknown): PolicyConfig {
  const result = policyConfigSchema.safeParse(raw ?? {})
  return result.success ? result.data : emptyPolicyConfig()
}

/* -------------------------------------------------------------------------- */
/* Etiquetas y descripciones para el editor                                    */
/* -------------------------------------------------------------------------- */

export const USB_MODE_LABEL: Record<z.infer<typeof enforcementMode>, string> = {
  allow: 'Permitir',
  read_only: 'Solo lectura',
  block: 'Bloquear',
}

export const USB_MODE_HELP: Record<z.infer<typeof enforcementMode>, string> = {
  allow: 'Los dispositivos de almacenamiento funcionan sin restriccion.',
  read_only: 'Se puede leer del USB pero no escribir en el. Corta la salida sin impedir el trabajo.',
  block: 'El volumen no llega a montarse. Maxima proteccion, mayor friccion.',
}

/**
 * QUE CONTROLES PREVIENEN DE VERDAD Y CUALES SOLO AVISAN
 * ============================================================================
 *
 * El agente corre en modo usuario. Eso no es una decision de producto: meterlo
 * en modo kernel exige un driver con certificado EV mas atestacion de Microsoft,
 * y un fallo ahi es una pantalla azul en el equipo del cliente.
 *
 * La consecuencia es que no todos los modos que este editor ofrece se pueden
 * cumplir, y el editor TIENE que decirlo. Un administrador que configura
 * "bloquear" y ve el equipo como cubierto esta confiando en una proteccion que
 * no existe; se enterara el dia que alguien se lleve la informacion, que es el
 * peor momento posible para descubrirlo.
 *
 * Esta tabla es la fuente unica de esa verdad. Si un canal gana prevencion real
 * —por ejemplo con un driver de sistema de archivos— se cambia aqui y la
 * interfaz entera deja de avisar sola.
 */
export type NivelDeAplicacion = 'previene' | 'mitiga' | 'solo_registra'

export const APLICACION_POR_CANAL: Record<
  'usb' | 'web' | 'clipboard' | 'printing' | 'storage',
  { nivel: NivelDeAplicacion; nota?: string }
> = {
  usb: { nivel: 'previene' },
  web: {
    nivel: 'previene',
    nota: 'El agente desactiva DNS-over-HTTPS en Edge y Chrome; sin eso el navegador resolveria por su cuenta y saltaria el bloqueo. La lista blanca de dominios no se puede imponer y queda solo como alerta.',
  },
  clipboard: {
    nivel: 'mitiga',
    nota: 'Windows no ofrece forma de impedir una copia. El agente vacia el portapapeles justo despues, lo que corta el caso normal —copiar aqui y pegar alla— pero deja una ventana de una fraccion de segundo.',
  },
  printing: {
    nivel: 'mitiga',
    nota: 'El trabajo se cancela en cuanto entra en la cola. Un documento largo se corta casi entero, pero uno de una pagina puede alcanzar a salir.',
  },
  storage: {
    nivel: 'solo_registra',
    nota: 'Impedir un guardado exige un driver en modo kernel. El agente DETECTA el archivo despues de escrito y abre el incidente, pero no evita la escritura.',
  },
}

export const NIVEL_LABEL: Record<NivelDeAplicacion, string> = {
  previene: 'Previene',
  mitiga: 'Mitiga',
  solo_registra: 'Solo registra',
}

export const CLIPBOARD_MODE_LABEL: Record<z.infer<typeof clipboardMode>, string> = {
  allow: 'Permitir',
  alert: 'Alertar',
  block: 'Bloquear',
}

export const CLIPBOARD_MODE_HELP: Record<z.infer<typeof clipboardMode>, string> = {
  allow: 'No se registra ni se interviene el portapapeles.',
  alert: 'Se registra un incidente pero la copia se completa. Util para medir antes de bloquear.',
  block:
    'El portapapeles se vacia inmediatamente despues de copiar. Corta el caso normal, pero no es prevencion: queda una fraccion de segundo en la que un pegado muy rapido llega antes.',
}

export const PRINTING_MODE_LABEL: Record<z.infer<typeof printingMode>, string> = {
  allow: 'Permitir',
  log: 'Registrar',
  block: 'Bloquear',
}

export const PRINTING_MODE_HELP: Record<z.infer<typeof printingMode>, string> = {
  allow: 'No se registran los trabajos de impresion.',
  log: 'Se registra que se imprimio, cuantas paginas y desde que equipo.',
  block:
    'El trabajo se cancela en cuanto entra en la cola. Un documento largo se corta casi entero, pero uno de una pagina puede alcanzar a salir.',
}
