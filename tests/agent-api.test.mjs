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

/**
 * Credencial de la ORGANIZACION (`nrt_live_…`). Solo sirve para dar de alta un
 * equipo: el resto de rutas exige la credencial propia que devuelve el alta.
 */
const KEY = process.argv[2]

/** Credencial del EQUIPO (`nrt_ep_…`). La rellena el enrolamiento. */
let EP_KEY = null

/** Identificador de deduplicacion. El agente real lo genera y lo CONSERVA. */
const evt = (event_type, payload = {}, id = crypto.randomUUID()) => ({
  event_type,
  occurred_at: new Date().toISOString(),
  client_event_id: id,
  payload,
})

let pass = 0
let fail = 0

function check(ok, label, detail = '') {
  if (ok) { pass++; console.log(`PASS   ${label}`) }
  else { fail++; console.log(`FALLO  ${label}${detail ? ` -> ${detail}` : ''}`) }
}

async function post(path, body, key = undefined) {
  if (key === undefined) key = EP_KEY ?? KEY
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
}, KEY)
check(enroll.status === 200 && enroll.json?.endpoint_id, 'POST /enroll registra el equipo',
  JSON.stringify(enroll.json))
const endpointId = enroll.json?.endpoint_id
check(Boolean(enroll.json?.profile_id), '/enroll asigna el perfil por defecto')
check(/^nrt_ep_[0-9a-f]{64}$/.test(enroll.json?.agent_credential ?? ''),
  '/enroll devuelve la credencial propia del equipo')
EP_KEY = enroll.json?.agent_credential

const reEnroll = await post('/enroll', {
  machine_fingerprint: 'fp-http-e2e-0001',
  hostname: 'HTTP-E2E-01',
  agent_version: '1.0.1',
}, KEY)
check(reEnroll.json?.endpoint_id === endpointId, 're-enroll devuelve el MISMO equipo')
check(reEnroll.json?.agent_credential !== EP_KEY,
  're-enroll ROTA la credencial del equipo')

const credencialVieja = EP_KEY
EP_KEY = reEnroll.json?.agent_credential

const conVieja = await post('/heartbeat', { endpoint_id: endpointId }, credencialVieja)
check(conVieja.status === 401, 'la credencial anterior deja de servir tras rotar',
  `status ${conVieja.status}`)

// --- validacion de cuerpo ----------------------------------------------------
const badBody = await post('/enroll', { hostname: 'X' }, KEY)
check(badBody.status === 400, 'cuerpo sin huella de maquina devuelve 400')

const shortFp = await post('/enroll', { machine_fingerprint: 'abc', hostname: 'X' }, KEY)
check(shortFp.status === 400, 'huella demasiado corta devuelve 400')

// --- ingesta -----------------------------------------------------------------
const lote = [
  evt('file_created', { path: 'C:\\a\\b.docx', user: 'mrestrepo' }),
  evt('web_visit', { domain: 'wetransfer.com' }),
  evt('usb_connected', { serial: 'SANDISK-99', enforcement: 'block' }),
]

const ingest = await post('/events', { endpoint_id: endpointId, events: lote })
check(ingest.json?.accepted === 3, 'POST /events acepta un lote valido',
  JSON.stringify(ingest.json))
check(ingest.json?.duplicates === 0, 'un lote nuevo no reporta duplicados')

// --- idempotencia ------------------------------------------------------------
// Reenviar el MISMO lote es lo que hace un agente cuya respuesta se perdio por
// timeout. Sin deduplicacion, esto insertaba todo otra vez.
const reenvio = await post('/events', { endpoint_id: endpointId, events: lote })
check(reenvio.json?.accepted === 3 && reenvio.json?.duplicates === 3,
  'reenviar el mismo lote no duplica y se cuenta como aceptado',
  JSON.stringify(reenvio.json))

// Mismo contenido, client_event_id nuevo: es un evento DISTINTO y debe entrar.
const mismoContenido = await post('/events', {
  endpoint_id: endpointId,
  events: [evt('web_visit', { domain: 'wetransfer.com' })],
})
check(mismoContenido.json?.accepted === 1 && mismoContenido.json?.duplicates === 0,
  'mismo contenido con identificador nuevo SI entra')

const mixed = await post('/events', {
  endpoint_id: endpointId,
  events: [
    evt('logon', { user: 'mrestrepo' }),
    evt('tipo_inexistente', {}),
    evt('web_visit', { domain: '' }),
  ],
})
check(mixed.json?.accepted === 1 && mixed.json?.rejected === 2,
  'un evento invalido no tumba el lote', JSON.stringify(mixed.json))
check(Array.isArray(mixed.json?.details) && mixed.json.details[0]?.reason,
  'se informa el motivo de cada descarte')

const sinId = await post('/events', {
  endpoint_id: endpointId,
  events: [{ event_type: 'logon', occurred_at: now(), payload: {} }],
})
check(sinId.status === 400, 'un evento sin client_event_id se rechaza',
  `status ${sinId.status}`)

const tooBig = await post('/events', {
  endpoint_id: endpointId,
  events: Array.from({ length: 1001 }, () => evt('logon')),
})
check(tooBig.status === 400, 'lote de 1001 eventos devuelve 400')

// --- aislamiento entre equipos ----------------------------------------------
// El hueco que cerro la credencial por equipo: con la clave del tenant, un
// portatil podia escribir telemetria en nombre de cualquier otro.
const otro = await post('/enroll', {
  machine_fingerprint: 'fp-http-e2e-0002',
  hostname: 'HTTP-E2E-02',
}, KEY)
const otroId = otro.json?.endpoint_id

const suplantacion = await post('/events', {
  endpoint_id: otroId,
  events: [evt('logon', { user: 'atacante' })],
})
check(suplantacion.status === 401,
  'un equipo NO puede escribir telemetria de otro equipo del mismo tenant',
  `status ${suplantacion.status}`)

const conClaveDeTenant = await post('/events',
  { endpoint_id: endpointId, events: [evt('logon')] }, KEY)
check(conClaveDeTenant.status === 401,
  'la credencial de organizacion ya no sirve para ingerir',
  `status ${conClaveDeTenant.status}`)

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
