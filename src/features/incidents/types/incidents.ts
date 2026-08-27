import type { IncidentSeverity, IncidentStatus } from '@/shared/types/database'

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  critical: 'Critica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

/**
 * Solo critica y alta usan rojo. Si las cuatro severidades fueran de color, el
 * analista dejaria de distinguir lo urgente a golpe de vista — que es justo lo
 * que la severidad existe para permitir.
 */
export const SEVERITY_TONE: Record<IncidentSeverity, 'critical' | 'warning' | 'neutral'> = {
  critical: 'critical',
  high: 'critical',
  medium: 'warning',
  low: 'neutral',
}

/** Orden de gravedad para ordenar en el cliente. */
export const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Abierto',
  reviewed: 'Revisado',
  closed: 'Cerrado',
  false_positive: 'Falso positivo',
}

export const STATUS_TONE: Record<IncidentStatus, 'critical' | 'warning' | 'success' | 'neutral'> = {
  open: 'critical',
  reviewed: 'warning',
  closed: 'success',
  false_positive: 'neutral',
}

/** Que significa cada estado en el flujo de revision. */
export const STATUS_HELP: Record<IncidentStatus, string> = {
  open: 'Nadie lo ha mirado todavia.',
  reviewed: 'Revisado, pendiente de accion o de decision.',
  closed: 'Atendido. La violacion era real y se gestiono.',
  false_positive: 'La regla se disparo sobre actividad legitima. Conviene ajustarla.',
}

export const CHANNEL_LABEL: Record<string, string> = {
  storage: 'Guardado',
  usb: 'USB',
  web: 'Navegacion',
  clipboard: 'Portapapeles',
  print: 'Impresion',
  email: 'Correo',
  apps: 'Aplicaciones',
  network: 'Red',
  accounts: 'Cuentas',
  integrity: 'Integridad',
}

export const RULE_LABEL: Record<string, string> = {
  'storage.carpeta_no_autorizada': 'Guardado fuera de carpeta autorizada',
  'storage.extension_prohibida': 'Extension de archivo prohibida',
  'classification.dato_vigilado': 'Dato clasificado en movimiento',
  'apps.proceso_no_autorizado': 'Aplicacion no autorizada',
  'network.cambio_de_red': 'Cambio de red (IP publica)',
  'accounts.nuevo_administrador': 'Nuevo administrador local',
  'accounts.cuenta_nueva': 'Cuenta local nueva',
  'accounts.cuenta_sensible_habilitada': 'Cuenta integrada habilitada',
  'accounts.inicios_fallidos': 'Exceso de inicios de sesion fallidos',
  'persistence.autoarranque_nuevo': 'Nuevo programa en el autoarranque',
  'exposure.recurso_compartido_nuevo': 'Nuevo recurso compartido',
  'exposure.puerto_nuevo': 'Nuevo puerto a la escucha',
  'exfil.copia_a_externo': 'Copia masiva a unidad externa',
  'integrity.archivo_modificado': 'Archivo critico modificado',
  'geo.fuera_de_sede': 'Equipo fuera de la sede (geocerca)',
  'usb.dispositivo_no_autorizado': 'Dispositivo USB no autorizado',
  'web.dominio_bloqueado': 'Dominio bloqueado',
  'web.fuera_de_lista_blanca': 'Sitio fuera de la lista blanca',
  'web.webmail_bloqueado': 'Correo personal bloqueado',
  'clipboard.copia_desde_origen_protegido': 'Copia desde origen protegido',
  'print.trabajo_intervenido': 'Trabajo de impresion intervenido',
  'print.cuota_excedida': 'Cuota de impresion excedida',
}

export function ruleLabel(rule: string): string {
  return RULE_LABEL[rule] ?? rule
}

export const ENFORCEMENT_LABEL: Record<string, string> = {
  blocked: 'Bloqueado',
  block: 'Bloqueado',
  read_only: 'Solo lectura',
  alerted: 'Alertado',
  alert: 'Alertado',
  allowed: 'Permitido',
  log: 'Solo registrado',
  quarantine: 'En cuarentena',
  quarantined: 'En cuarentena',
  terminated: 'Proceso terminado',
  terminate: 'Terminar proceso',
}
