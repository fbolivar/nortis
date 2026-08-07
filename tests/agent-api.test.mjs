/**
 * Prueba de la superficie /api/agent por HTTP real, simulando lo que hara el
 * agente Go. No usa el cliente de Supabase: solo fetch, igual que el agente.
 *
 * Uso:
 *   1. Genere una credencial en la consola (Administracion > Credenciales).
 *   2. npm run dev
 *   3. node tests/agent-api.test.mjs nrt_live_xxxxx
 *
 * POR QUE ESTA SUITE EXISTE APARTE DE LAS PRUEBAS SQL: probando los RPC
 * directamente contra la base, el proxy de Next.js ni siquiera interviene. La
 * primera version de esta API estaba COMPLETA detras del gate de sesion y
 * redirigia al agente a /login — las pruebas SQL pasaban todas y la superficie
 * era inalcanzable. Lo que se despliega es HTTP; hay que probar HTTP.
 */
const BASE = 'http://localhost:3000/api/agent'
const KEY = process.argv[2]

let pass = 0
let fail = 0

function check(ok, label, detail = '') {
  if (ok) { pass++; console.log(`PASS   ${label}`) }
  else { fail++; console.log(`FALLO  ${label}${detail ? ` -> ${detail}` : ''}`) }
}

async function post(path, body, key = KEY) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const now = () => new Date().toISOString()

// --- version: publico, sin credencial ---------------------------------------
const version = await fetch(`${BASE}/version`).then((r) => r.json())
check(
  version.current_version && version.policy_schema_version >= 1,
  'GET /version responde sin credencial',
  JSON.stringify(version)
)
check(
  version.download_url === null && version.sha256 === null,
  '/version no publica URL de descarga sin firma'
)

// --- autenticacion -----------------------------------------------------------
const noAuth = await post('/heartbeat', { endpoint_id: crypto.randomUUID() }, null)
check(noAuth.status === 401, 'sin Authorization devuelve 401', `status ${noAuth.status}`)

const badKey = await post('/enroll',
  { machine_fingerprint: 'fp-http-000001', hostname: 'X' },
  'nrt_live_' + 'a'.repeat(64))
check(badKey.status === 401, 'credencial inexistente devuelve 401', `status ${badKey.status}`)

const malformed = await post('/enroll',
  { machine_fingerprint: 'fp-http-000001', hostname: 'X' }, 'no-es-una-clave')
check(malformed.status === 401, 'credencial con formato invalido devuelve 401')

// --- enroll ------------------------------------------------------------------
const enroll = await post('/enroll', {
  machine_fingerprint: 'fp-http-e2e-0001',
  hostname: 'HTTP-E2E-01',
  os_version: 'Windows 11 Pro 24H2',
  agent_version: '1.0.0',
  user: 'mrestrepo',
})
check(enroll.status === 200 && enroll.json?.endpoint_id, 'POST /enroll registra el equipo',
  JSON.stringify(enroll.json))
const endpointId = enroll.json?.endpoint_id
check(Boolean(enroll.json?.profile_id), '/enroll asigna el perfil por defecto')

const reEnroll = await post('/enroll', {
  machine_fingerprint: 'fp-http-e2e-0001',
  hostname: 'HTTP-E2E-01',
  agent_version: '1.0.1',
})
check(reEnroll.json?.endpoint_id === endpointId, 're-enroll devuelve el MISMO equipo')

// --- validacion de cuerpo ----------------------------------------------------
const badBody = await post('/enroll', { hostname: 'X' })
check(badBody.status === 400, 'cuerpo sin huella de maquina devuelve 400')

const shortFp = await post('/enroll', { machine_fingerprint: 'abc', hostname: 'X' })
check(shortFp.status === 400, 'huella demasiado corta devuelve 400')

// --- ingesta -----------------------------------------------------------------
const ingest = await post('/events', {
  endpoint_id: endpointId,
  events: [
    { event_type: 'file_created', occurred_at: now(), payload: { path: 'C:\\a\\b.docx', user: 'mrestrepo' } },
    { event_type: 'web_visit', occurred_at: now(), payload: { domain: 'wetransfer.com' } },
    { event_type: 'usb_connected', occurred_at: now(), payload: { serial: 'SANDISK-99', enforcement: 'block' } },
  ],
})
check(ingest.json?.accepted === 3, 'POST /events acepta un lote valido',
  JSON.stringify(ingest.json))

const mixed = await post('/events', {
  endpoint_id: endpointId,
  events: [
    { event_type: 'logon', occurred_at: now(), payload: { user: 'mrestrepo' } },
    { event_type: 'tipo_inexistente', occurred_at: now(), payload: {} },
    { event_type: 'web_visit', occurred_at: now(), payload: { domain: '' } },
  ],
})
check(mixed.json?.accepted === 1 && mixed.json?.rejected === 2,
  'un evento invalido no tumba el lote', JSON.stringify(mixed.json))
check(Array.isArray(mixed.json?.details) && mixed.json.details[0]?.reason,
  'se informa el motivo de cada descarte')

const tooBig = await post('/events', {
  endpoint_id: endpointId,
  events: Array.from({ length: 1001 }, () => ({ event_type: 'logon', occurred_at: now() })),
})
check(tooBig.status === 400, 'lote de 1001 eventos devuelve 400')

const foreign = await post('/events', { endpoint_id: crypto.randomUUID(), events: [] })
check(foreign.status === 400 || foreign.status === 401,
  'equipo ajeno o lote vacio no se acepta', `status ${foreign.status}`)

// --- politica ----------------------------------------------------------------
const policy = await post('/policy', { endpoint_id: endpointId })
check(policy.status === 200 && policy.json?.profile?.config,
  'POST /policy entrega la politica vigente')
check(policy.json?.profile?.config?.monitoring?.window_titles === false,
  'sin consentimiento, /policy recorta el monitoreo invasivo',
  JSON.stringify(policy.json?.profile?.config?.monitoring))
check(policy.json?.monitoring_allowed === false, '/policy informa que el monitoreo no esta autorizado')
check(typeof policy.json?.console_schema_version === 'number',
  '/policy declara la version de esquema de la consola')

// --- latido ------------------------------------------------------------------
const beat = await post('/heartbeat', { endpoint_id: endpointId, agent_version: '1.0.1', user: 'mrestrepo' })
check(beat.json?.acknowledged === true, 'POST /heartbeat responde')
check(beat.json?.policy_updated_at, '/heartbeat informa la fecha de la politica')
check(beat.json?.quarantined === false, '/heartbeat informa el estado de cuarentena')

console.log(`\n${pass} pruebas superadas, ${fail} fallidas`)
process.exit(fail === 0 ? 0 : 1)
