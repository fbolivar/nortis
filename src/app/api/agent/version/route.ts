import { NextResponse } from 'next/server'
import { CURRENT_AGENT_VERSION, MIN_AGENT_VERSION } from '@/shared/schemas/agent-api'
import { POLICY_SCHEMA_VERSION } from '@/shared/schemas/policy'

/**
 * GET /api/agent/version
 *
 * Consulta de version para la auto-actualizacion. NO requiere credencial: no
 * revela nada de ningun tenant, y exigirla impediria que un agente con la clave
 * caducada o revocada supiera que existe una version nueva — justo el caso en
 * que mas falta hace poder actualizarlo.
 *
 * PENDIENTE DELIBERADO: `download_url` y `sha256` van nulos hasta que exista el
 * pipeline que compile y FIRME el MSI. Se declaran ya en el contrato para que el
 * agente los consuma desde el primer dia, pero publicar una URL de descarga sin
 * hash ni firma seria peor que no publicar ninguna: el agente corre con
 * privilegios de sistema y reemplazaria su propio binario por lo que hubiera al
 * otro lado de esa URL.
 */
export async function GET() {
  return NextResponse.json({
    current_version: CURRENT_AGENT_VERSION,
    minimum_supported_version: MIN_AGENT_VERSION,
    policy_schema_version: POLICY_SCHEMA_VERSION,
    download_url: null,
    sha256: null,
  })
}
