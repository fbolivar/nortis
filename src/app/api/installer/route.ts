import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { crearZip } from '@/features/tenant/lib/installer-zip'

/**
 * POST /api/installer
 *
 * Arma, para el tenant de la sesion, el paquete de instalacion del agente y lo
 * devuelve como un ZIP descargable: el MSI, un `instalar.bat` con la credencial
 * de enrolamiento de ESTE cliente ya incrustada, y `console_pubkey.pem` —el
 * ancla de confianza de la proteccion anti-manipulacion—.
 *
 * NO vive bajo /api/agent a proposito: esa superficie es publica (la usa el
 * agente sin sesion). Esta acuña una credencial y exige sesion de admin; el
 * middleware la protege por defecto al no empezar por /api/agent.
 *
 * Es POST y no GET porque tiene efecto: cada descarga genera una credencial de
 * enrolamiento nueva. Asi un instalador filtrado se revoca sin tocar a los demas
 * equipos ya desplegados, y la descarga no es cacheable por error.
 */
export async function POST(request: Request) {
  const session = await getSessionContext()

  // Defensa en profundidad: el RPC ya exige owner/admin + MFA dentro de la base,
  // pero responder aqui evita acuñar nada y da un error legible en vez de un 500.
  if (!session) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }
  if (session.role !== 'owner' && session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Solo un owner o admin puede descargar el instalador' },
      { status: 403 }
    )
  }
  if (!session.mfaSatisfied) {
    return NextResponse.json(
      { error: 'Se requiere segundo factor para descargar el instalador' },
      { status: 403 }
    )
  }

  const supabase = await createClient()

  // El MSI y la clave publica son comunes a todos los tenants: se sirven desde el
  // bucket agent-dist, donde los publica operaciones. Si aun no estan, se dice
  // con claridad en vez de entregar un ZIP a medias.
  const [msi, pubkey] = await Promise.all([
    supabase.storage.from('agent-dist').download('NortisAgent.msi'),
    supabase.storage.from('agent-dist').download('console_pubkey.pem'),
  ])

  if (msi.error || !msi.data) {
    return NextResponse.json(
      {
        error:
          'El instalador aun no esta publicado. Suba NortisAgent.msi al bucket agent-dist de Storage.',
      },
      { status: 503 }
    )
  }
  if (pubkey.error || !pubkey.data) {
    return NextResponse.json(
      {
        error:
          'Falta la clave publica de la consola. Suba console_pubkey.pem al bucket agent-dist de Storage.',
      },
      { status: 503 }
    )
  }

  // La credencial de enrolamiento se genera ahora, en el momento de la descarga.
  // El RPC la devuelve en claro una sola vez; se usa aqui para el .bat y no se
  // guarda en ningun sitio mas.
  const marca = new Date().toISOString().slice(0, 16).replace('T', ' ')
  // p_expires_at se omite: el RPC lo toma como null (sin caducidad). El tipo
  // generado no admite null explicito, y omitirlo es lo mismo para la funcion.
  const { data: claveRows, error: claveError } = await supabase.rpc('create_api_key', {
    p_name: `Instalador ${marca}`,
  })
  if (claveError || !claveRows?.[0]?.api_key) {
    return NextResponse.json(
      { error: `No se pudo generar la credencial de enrolamiento: ${claveError?.message ?? 'desconocido'}` },
      { status: 500 }
    )
  }
  const apiKey = claveRows[0].api_key as string

  // La URL de la consola es el origen desde el que el admin descarga: es la que
  // su despliegue usa de verdad, sin depender de una constante que se desincronice.
  const consolaURL = new URL(request.url).origin

  const [msiBytes, pubkeyBytes] = await Promise.all([
    msi.data.arrayBuffer().then((b) => new Uint8Array(b)),
    pubkey.data.arrayBuffer().then((b) => new Uint8Array(b)),
  ])

  const codificador = new TextEncoder()
  const zip = crearZip([
    { nombre: 'NortisAgent.msi', datos: msiBytes },
    { nombre: 'console_pubkey.pem', datos: pubkeyBytes },
    { nombre: 'instalar.bat', datos: codificador.encode(guionInstalador(apiKey, consolaURL)) },
    { nombre: 'LEEME.txt', datos: codificador.encode(leeme()) },
  ])

  const nombreZip = `nortis-agent-${slug(session.organization?.name ?? 'tenant')}.zip`

  return new NextResponse(zip as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nombreZip}"`,
      // Un paquete con una credencial dentro no debe quedar en ninguna cache
      // intermedia.
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * guionInstalador produce el .bat. Deja la clave publica en su sitio ANTES de
 * instalar —para que el ciclo de proteccion del servicio la encuentre y endurezca
 * en cuanto arranque— y lanza el MSI en silencio con la credencial y la URL. El
 * MSI se encarga del enrolamiento (propiedades CLAVE/CONSOLA) y del servicio.
 *
 * Los saltos de linea son CRLF: es un .bat, y un .bat con finales Unix se ejecuta
 * de forma erratica en algunos Windows.
 */
function guionInstalador(apiKey: string, consolaURL: string): string {
  const l = [
    '@echo off',
    'setlocal',
    'REM Instalador del agente Nortis. Ejecutar como Administrador.',
    '',
    'net session >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '  echo.',
    '  echo   Este instalador debe ejecutarse como Administrador.',
    '  echo   Haga clic derecho sobre instalar.bat y elija "Ejecutar como administrador".',
    '  echo.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'set "DEST=%ProgramData%\\Nortis\\Agent"',
    'if not exist "%DEST%" mkdir "%DEST%"',
    'REM La clave publica de la consola: sin ella el agente NO se endurece (es',
    'REM el interbloqueo de seguridad). Se coloca antes de instalar.',
    'copy /y "%~dp0console_pubkey.pem" "%DEST%\\console_pubkey.pem" >nul',
    '',
    'echo Instalando Nortis Agent...',
    `msiexec /i "%~dp0NortisAgent.msi" /qn /norestart CLAVE="${apiKey}" CONSOLA="${consolaURL}"`,
    'if %errorlevel% neq 0 (',
    '  echo   Fallo la instalacion. Codigo: %errorlevel%',
    '  exit /b %errorlevel%',
    ')',
    '',
    'echo.',
    'echo   Nortis Agent instalado. El equipo aparecera en la consola en menos de un minuto.',
    'echo   La proteccion anti-manipulacion se activa automaticamente.',
    'echo.',
    'endlocal',
    '',
  ]
  return l.join('\r\n')
}

function leeme(): string {
  return [
    'NORTIS — Paquete de instalacion del agente',
    '===========================================',
    '',
    'Contenido:',
    '  NortisAgent.msi      El instalador del agente.',
    '  instalar.bat         Instalador guiado. Ejecutar como Administrador.',
    '  console_pubkey.pem   Clave publica de su consola (ancla de confianza de la',
    '                       proteccion anti-manipulacion).',
    '',
    'Instalacion:',
    '  1. Descomprima este ZIP en el equipo a proteger.',
    '  2. Clic derecho sobre instalar.bat -> "Ejecutar como administrador".',
    '  3. El equipo aparecera en la consola en menos de un minuto.',
    '',
    'IMPORTANTE — este paquete contiene una credencial.',
    '  instalar.bat lleva incrustada una credencial de enrolamiento de su',
    '  organizacion. Tratelo como una contrasena: no lo comparta ni lo suba a',
    '  sitios publicos. Si se le extravia, revoquelo desde la consola',
    '  (Ajustes -> Credenciales) y descargue un paquete nuevo.',
    '',
    'Desinstalacion:',
    '  El agente esta protegido contra manipulacion: un usuario normal no puede',
    '  detenerlo ni desinstalarlo. Para retirarlo hace falta un vale de',
    '  desinstalacion emitido desde la consola. Consulte al administrador.',
    '',
  ].join('\r\n')
}

/** slug reduce el nombre del tenant a algo valido para un nombre de archivo. */
function slug(nombre: string): string {
  return (
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'tenant'
  )
}
