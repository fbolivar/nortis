import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
 * Si hay una version publicada (tabla agent_releases, marcada como actual),
 * devuelve su numero, su sha256 y la URL firmada del MSI. Si no hay ninguna,
 * cae a las constantes del contrato con download_url/sha256 nulos: el agente lo
 * interpreta como "actualizacion armada pero inactiva" y no descarga nada.
 *
 * El agente SIEMPRE verifica el sha256 antes de aplicar: corre como LocalSystem
 * y reemplaza su propio binario, asi que una URL sin hash comprobado seria
 * entregarle el sistema a quien la controle.
 */
export async function GET() {
  const supabase = await createClient()

  // Funcion SECURITY DEFINER ejecutable por anon: esta ruta no tiene sesion.
  const { data } = await supabase.rpc('current_agent_release')
  const release = data?.[0]

  return NextResponse.json({
    current_version: release?.version ?? CURRENT_AGENT_VERSION,
    minimum_supported_version: MIN_AGENT_VERSION,
    policy_schema_version: POLICY_SCHEMA_VERSION,
    download_url: release?.download_url ?? null,
    sha256: release?.sha256 ?? null,
  })
}
