# PRP-001: Agente de endpoint Nortis (Windows, Go)

> **Estado**: PENDIENTE
> **Fecha**: 2026-08-07
> **Proyecto**: Nortis (consola) + nortis-agent (repo nuevo)

---

## Objetivo

Construir el agente de endpoint para Windows en Go: un servicio que se enrola contra
`/api/agent/enroll`, observa la actividad del equipo, emite la telemetria definida en
`src/shared/schemas/telemetry.ts` por lotes hacia `/api/agent/events`, descarga y aplica las
politicas de `src/shared/schemas/policy.ts` desde `/api/agent/policy`, y mantiene su presencia
en el inventario con `/api/agent/heartbeat`, sobreviviendo a cortes de red sin perder eventos.

## Por Que

| Problema | Solucion |
|----------|----------|
| La consola esta completa pero no tiene fuente de datos real: hoy el panel se alimenta de `supabase/seed/demo_telemetry.sql`. Sin agente, Nortis no es un producto vendible. | El agente cierra el circuito: convierte la actividad real del endpoint en `activity_events` y en incidentes DLP. |
| Las politicas de seguridad (`security_profiles.config`) se editan en la consola pero no las aplica nadie. El panel diria que un equipo esta "cubierto" sin que exista control alguno. | El agente descarga la politica, la cachea en disco y la aplica aunque pierda conectividad. |
| Un equipo sin red durante horas dejaria un agujero en la evidencia justo cuando mas importa (la fuga suele ocurrir con el portatil fuera de la oficina). | Cola durable en disco con drenaje por lotes cuando vuelve la conectividad. |
| El cliente necesita prueba de QUE ocurrio un movimiento de informacion sin que Nortis se convierta en un deposito de datos sensibles. | El agente emite rutas, dominios, hashes y tamaños; nunca contenido. La regla vive en el contrato y se repite en el agente. |

**Valor de negocio**: es la pieza que hace facturable el producto (cobro por equipo). Sin agente,
cero clientes. Con agente, cada endpoint instalado es una linea de facturacion y la consola pasa
de demo a herramienta operativa.

## Que

### Criterios de Exito

- [ ] Un MSI instala el agente como servicio de Windows en modo silencioso (`msiexec /qn NORTIS_API_KEY=nrt_live_…`) y el equipo aparece en el inventario de la consola en menos de 60 s.
- [ ] Reinstalar el agente en la misma maquina NO duplica el equipo en el inventario (mismo `machine_fingerprint` → misma fila) ni saca al equipo de cuarentena.
- [ ] Los 13 `event_type` de `TELEMETRY_PAYLOADS` se emiten con payloads que la consola acepta: en una prueba de 1 000 eventos reales, `rejected == 0` en la respuesta de `/api/agent/events`.
- [ ] Con la red caida 2 h y 50 000 eventos generados, al restaurar la conectividad se ingiere el 100 % de los eventos con `occurred_at` dentro de la ventana valida, sin duplicados y sin exceder el limite de tasa.
- [ ] Cambiar una politica en la consola se refleja en el endpoint en ≤ 2 ciclos de latido, detectado por `policy_updated_at` del heartbeat (no re-descargando la politica en cada latido).
- [ ] Enforcement verificable EN MODO USUARIO: con `usb.mode = 'block'` el volumen no monta; con `usb.mode = 'read_only'` no se puede escribir; con `web.blocked_domains` la navegacion al dominio falla y se emite `web_visit` con `blocked: true`; con `clipboard.mode = 'block'` la copia se cancela; con `printing.mode = 'block'` el trabajo no se imprime.
- [ ] `storage.blocked_extensions` y `allowed_paths` se DETECTAN y generan incidente, pero NO se previenen en v1 (ver "Riesgo principal" abajo). La consola debe reflejar esa diferencia en el editor de politicas antes del piloto.
- [ ] Sin consentimiento (`monitoring_allowed: false` en `/api/agent/policy`) el agente NO captura titulos de ventana: `window_focus` se emite sin campo `title`.
- [ ] Si `console_schema_version > SCHEMA_VERSION_SOPORTADA` por el agente, este mantiene la ultima politica conocida, no aplica la nueva a medias, y se reporta desactualizado.
- [ ] Una flota de 200 equipos con UNA sola API key se mantiene por debajo de 600 req/min y 50 000 eventos/min agregados (sin 429 sostenidos).
- [ ] La API key nunca queda en texto plano en disco ni en la linea de comandos del proceso.

### Comportamiento Esperado (Happy Path)

1. **Instalacion**: el MSI despliega el binario en `%ProgramFiles%\Nortis\`, registra el servicio
   `NortisAgent` (arranque automatico, cuenta LocalSystem) y guarda la API key cifrada con DPAPI
   en el ambito de la maquina.
2. **Enrolamiento**: al arrancar, si no hay `endpoint_id` en el estado local, el agente calcula su
   `machine_fingerprint` (estable entre reinstalaciones), llama `POST /api/agent/enroll` con
   `Authorization: Bearer nrt_live_…` y persiste `endpoint_id`, `profile_id` y `organization_id`.
3. **Politica**: llama `POST /api/agent/policy`, compara `console_schema_version` con la version
   que entiende, valida el `config` contra su copia local del contrato, lo escribe en el cache de
   disco y activa los modulos correspondientes. Si `profile` es `null`, entra en modo observacion:
   registra pero no interviene.
4. **Observacion**: los colectores (archivos, USB, web, portapapeles, impresion, apps, ventana,
   sesion) escriben eventos normalizados en una cola durable en disco.
5. **Enforcement**: en paralelo, los modulos de bloqueo aplican la politica cacheada. Cada
   intervencion produce su propio evento con el campo `enforcement` correspondiente.
6. **Envio**: cada N segundos el agente drena la cola en lotes de hasta 1 000 eventos hacia
   `POST /api/agent/events`; solo borra de la cola lo que la respuesta confirma. Los eventos que
   la consola rechaza (`details[]`) se descartan y se registran localmente — no se reintentan.
7. **Latido**: cada minuto (con jitter) llama `POST /api/agent/heartbeat`. Si
   `policy_updated_at` es posterior al de su cache, vuelve al paso 3. Si `quarantined` es `true`,
   endurece de inmediato sin esperar al ciclo de politica.
8. **Version**: periodicamente consulta `GET /api/agent/version` (sin credencial). Si esta por
   debajo de `minimum_supported_version`, lo reporta; la auto-actualizacion queda armada pero
   inactiva mientras `download_url`/`sha256` vengan nulos.

---

## Contexto

### Referencias (codigo real de este repo)

| Archivo | Que aporta |
|---------|-----------|
| `src/shared/schemas/agent-api.ts` | Contrato HTTP: formato de la key (`^nrt_live_[0-9a-f]{64}$`), cuerpos de cada request, `MAX_BATCH_EVENTS = 1000`, `MIN_AGENT_VERSION`/`CURRENT_AGENT_VERSION`. |
| `src/shared/schemas/telemetry.ts` | Forma normativa de cada `payload` y la lista de los 13 `event_type`. Regla dura: nunca contenido. |
| `src/shared/schemas/policy.ts` | Forma de `security_profiles.config`, `POLICY_SCHEMA_VERSION = 1`, normalizacion de rutas (sin barra final), extensiones (`.ext`), dominios (solo host). |
| `src/shared/lib/agent-auth.ts` | Solo `Authorization: Bearer` (la key por query string esta prohibida). Codigos de error: `unauthorized` 401, `rate_limited` 429, `invalid_request` 400, `internal_error` 500. |
| `src/app/api/agent/{enroll,events,policy,heartbeat,version}/route.ts` | Forma exacta de cada respuesta. |
| `supabase/migrations/20260806122600_agent_api_surface.sql` | Invariantes del servidor: idempotencia por fingerprint, recorte de `title` sin consentimiento, ventana temporal `[now-90d, now+5min]`, cuarentena pegajosa. |
| `supabase/migrations/20260806122500_agent_api_rate_limit.sql` | Presupuesto real: **600 req/min y 50 000 eventos/min POR API KEY**, no por equipo. |
| `supabase/seed/demo_telemetry.sql` | Ejemplos de payloads que la consola ya sabe pintar. |

Documentacion externa de referencia: Windows ETW (`Microsoft-Windows-Kernel-File`), `ReadDirectoryChangesW`,
SetupAPI / WM_DEVICECHANGE para USB, Windows Filtering Platform para bloqueo de red, WinSpool para
impresion, `AddClipboardFormatListener` para portapapeles, `golang.org/x/sys/windows/svc` para el servicio.

### Arquitectura Propuesta

El agente vive en un **repositorio propio (`nortis-agent`)**, no dentro de este. Este repo es
Next.js + TypeScript; meter un modulo Go aqui contamina el CI, el lockfile y el build de Vercel.
La unica dependencia entre ambos es el contrato, y el contrato ya esta escrito en los tres
archivos de `src/shared/schemas/`.

```
nortis-agent/
├── cmd/
│   ├── nortis-agent/        # servicio Windows (entrypoint)
│   └── nortis-agentctl/     # CLI de diagnostico (estado, forzar sync, ver cola)
├── internal/
│   ├── contract/            # structs espejo de telemetry.ts + policy.ts + agent-api.ts
│   ├── api/                 # cliente HTTP: auth, reintentos, backoff, mapeo de errores
│   ├── identity/            # machine_fingerprint, estado local, DPAPI
│   ├── spool/               # cola durable en disco + batching + dedupe
│   ├── collectors/          # file, usb, web, clipboard, print, app, window, session
│   ├── policy/              # descarga, cache, guardia de schema_version
│   ├── enforce/             # usb, storage, web, clipboard, printing
│   └── health/              # metricas locales, log rotado, autodiagnostico
├── build/                   # WiX/MSI, firma
└── test/                    # E2E contra la consola local
```

**Decision clave — el contrato se replica a mano, no se genera.** Son ~200 lineas de structs y
generar Go desde Zod exigiria una herramienta mas en el pipeline. A cambio, un test de contrato en
CI del agente lee los `.ts` de este repo y falla si aparece un `event_type` o un campo de politica
que el agente no conoce. Barato y detecta la deriva, que es el riesgo real.

**Decision clave — la cola es un WAL en disco, no memoria.** Un agente que pierde eventos al
reiniciar el equipo no sirve como evidencia: la fuga tipica ocurre justo antes de apagar.

**Decision clave — presupuesto de tasa compartido.** 600 req/min por API key, y la key es del
tenant, no del equipo. Con 200 equipos: latido cada 60 s = 200 req/min, envio de eventos cada
5 min = 40 req/min, politica solo cuando cambia. Queda margen. Sin jitter, los 200 latirian en el
mismo segundo; el jitter no es cosmetico, evita el 429 en rafaga.

### Modelo de Datos

Ninguna tabla nueva. El agente escribe exclusivamente a traves de los cinco endpoints; toda la
persistencia ya existe (`endpoints`, `activity_events`, `security_profiles`, `api_keys`,
`agent_rate_limits`). **Estado local en el endpoint** (`%ProgramData%\Nortis\`):

```
state.json      { endpoint_id, organization_id, profile_id, agent_version, enrolled_at }
policy.cache    { schema_version, config, updated_at, fetched_at }  + HMAC de integridad
credential.dat  API key cifrada con DPAPI (ambito maquina)
spool/          segmentos de la cola de eventos + indice de checkpoint
```

---

## Riesgo principal: que se puede aplicar de verdad desde modo usuario

Un servicio Go corre en modo usuario. Eso acota lo que es fisicamente posible, y el editor de
politicas de la consola hoy ofrece modos que un agente en modo usuario NO puede cumplir.
Prometer prevencion que no previene es peor que no ofrecerla: el panel diria "cubierto".

| Control | Modo usuario | Como |
|---------|--------------|------|
| USB `block` / `read_only` | **Si** | Politicas de instalacion de dispositivos y `StorageDevicePolicies\WriteProtect` en el registro. |
| Portapapeles `block` | **Si, con matiz** | `AddClipboardFormatListener` + vaciado. Hay una ventana de carrera de milisegundos en la que otra app pudo leer. |
| Impresion `block` / `log` | **Si** | API del spooler (`FindFirstPrinterChangeNotification`), pausar o eliminar el trabajo. |
| Web `blocked_domains` | **Si, con matiz** | Bloqueo por DNS/hosts. Bloquea, pero la VISIBILIDAD por visita necesita extension de navegador; sin ella no hay `web_visit` fiable con dominio. |
| Archivos `blocked_extensions` / `allowed_paths` | **NO** | Impedir un guardado exige un **minifilter driver** en modo kernel. Desde modo usuario solo se detecta DESPUES (`ReadDirectoryChangesW` / USN journal). |
| Cifrado `confidential_paths` | **Fuera de alcance** | No existe endpoint para que el agente suba documentos cifrados; `encrypted_documents` no tiene vinculo con `endpoints`. |

**Decision recomendada para v1**: vender *visibilidad y alerta*, no *prevencion total*. Los cuatro
controles que si se pueden aplicar cubren las vias de fuga mas comunes en una PYME (USB, correo web,
portapapeles, impresion). El bloqueo de archivos entra en v2 con driver firmado.

El minifilter driver no es "una fase mas": exige certificado EV **mas** atestacion de Microsoft, y un
fallo en modo kernel es una pantalla azul en el equipo del cliente. Es un proyecto propio.

## Cambios en la consola — RESUELTOS

> **Cerrados el 2026-08-07** en `supabase/migrations/20260807190000_agent_endpoint_credentials_and_idempotency.sql`.
> Se conserva el analisis porque explica POR QUE el contrato es como es, y el
> agente tiene que implementarlo en consecuencia.
>
> **Lo que el agente debe hacer ahora:**
> 1. `POST /enroll` con la credencial de la organizacion (`nrt_live_…`) devuelve
>    `agent_credential` (`nrt_ep_…`) **una sola vez**. Guardarla con DPAPI y
>    **borrar del disco la clave de la organizacion**: dejarla ahi reabre el
>    hueco. Las otras tres rutas rechazan la clave del tenant con 401.
> 2. Reinstalar ROTA la credencial: la anterior deja de servir de inmediato.
> 3. Cada evento lleva `client_event_id` (UUID) **obligatorio**, generado una vez
>    y conservado entre reintentos. La respuesta trae `duplicates`, que va
>    incluido en `accepted` — un valor alto y sostenido significa que el agente
>    no esta purgando bien su cola.
> 4. El limite de tasa pasa a ser **por equipo** (120 req/min, 5 000 eventos/min);
>    el de la organizacion (600/min) solo aplica al alta. El jitter sigue siendo
>    buena practica, pero un agente en bucle ya no deja sin ingesta a la flota.

### 1. `agent_ingest` no es idempotente

`insert into public.activity_events (...)` sin `on conflict` y sin identificador de evento del
cliente. Si el agente envia un lote, el servidor lo confirma y la respuesta se pierde (timeout,
corte de red), el reintento inserta TODO otra vez: eventos duplicados, conteos inflados e incidentes
DLP repetidos. Es el escenario normal de un portatil con mala conectividad, no un caso raro.

*Correccion*: añadir `client_event_id uuid` al contrato de telemetria, indice unico por
`(endpoint_id, client_event_id)` y `on conflict do nothing`, devolviendo los duplicados como
`accepted` para que el agente pueda purgar su cola. Sin esto, el criterio "sin duplicados" de arriba
es inalcanzable.

### 2. La credencial es del tenant, no del equipo

`agent_authenticate` resuelve la API key a `organization_id`, y `agent_ingest` solo comprueba que el
`p_endpoint_id` pertenezca a esa organizacion. Consecuencia: **la misma key vive en cada portatil de
la flota**, y quien extraiga la de un solo equipo puede inyectar o falsear telemetria de CUALQUIER
otro equipo del tenant — y enrolar equipos nuevos. En un producto cuyo valor es servir de evidencia
forense, poder fabricar evidencia ajena desde el portatil mas descuidado es un fallo de diseño.

*Correccion*: que `agent_enroll` devuelva una credencial propia del endpoint (la key del tenant queda
solo para el alta), y que `agent_ingest`/`heartbeat`/`policy` la exijan. Permite ademas revocar un
equipo perdido sin rotar la clave de toda la flota.

## Calendario que no depende de escribir codigo

Empezar el dia 1, en paralelo con la Fase 1:

- **Certificado de firma de codigo EV**: sin el, SmartScreen bloquea el MSI y el cliente ve
  "aplicacion no reconocida" al instalar un producto de seguridad. La validacion de la entidad tarda
  semanas y exige documentacion mercantil de BC FABRIC SAS.
- **Allowlisting con fabricantes de antivirus**: el agente vigila archivos, engancha el portapapeles
  y observa USB. Se comporta igual que un spyware y sera puesto en cuarentena. Hay que enviar
  muestras a Microsoft Defender y a los AV que usen los clientes objetivo.

---

## Blueprint (Assembly Line)

### Fase 1: Cimientos y contrato
**Objetivo**: repo `nortis-agent` con estructura, structs espejo de los tres esquemas, cliente HTTP
con Bearer, backoff exponencial con jitter y mapeo de los cuatro codigos de error a decisiones
(401 = detenerse, 429 = retroceder, 400 = descartar, 5xx = reintentar).
**Validacion**: test de contrato que compara los 13 `event_type` y las 7 secciones de politica
contra los `.ts` de este repo; `go test ./...` verde.

### Fase 2: Identidad, servicio y enrolamiento
**Objetivo**: `machine_fingerprint` estable, servicio Windows con arranque/parada limpios, custodia
de la key con DPAPI, enrolamiento idempotente y persistencia del estado local.
**Validacion**: instalar, desinstalar y reinstalar produce UNA sola fila en `endpoints`; la key no
aparece en disco en claro ni en la linea de comandos del proceso.

### Fase 3: Cola durable y transporte de telemetria
**Objetivo**: spool en disco con lotes de ≤ 1 000, checkpoint tras confirmacion, filtrado local de
la ventana temporal `[now-90d, now+5min]`, tratamiento de `details[]` y respeto del presupuesto de
tasa compartido.
**Validacion**: 50 000 eventos con la red caida 2 h se ingieren completos al restaurar, sin
duplicados; matar el proceso a mitad del drenaje no pierde ni duplica eventos.

### Fase 4: Colectores de actividad (sesion, apps, archivos)
**Objetivo**: `logon`, `logoff`, `idle_start`, `idle_end`, `app_open`, `window_focus`,
`file_created`, `file_modified`, `file_deleted`, con hash SHA-256 y deteccion de volumen extraible.
**Validacion**: una sesion de trabajo real de 30 min produce eventos con `rejected == 0` y la
linea de tiempo de la consola los pinta correctamente.

### Fase 5: Colectores DLP (USB, web, portapapeles, impresion)
**Objetivo**: `usb_connected` con serial, `web_visit` solo con host, `clipboard_copy` con tamaño y
apps de origen/destino, `print_job` con nombre de documento y paginas.
**Validacion**: el motor DLP de la consola genera incidentes a partir de estos eventos; ningun
payload contiene contenido (revision manual de una muestra de 100 eventos).

### Fase 6: Motor de politica
**Objetivo**: descarga, validacion, cache firmado en disco, guardia de `schema_version`, refresco
disparado por `policy_updated_at` del latido, y modo observacion cuando `profile` es `null`.
**Validacion**: cambiar la politica en la consola se aplica en ≤ 2 latidos; simular
`console_schema_version` mayor deja la politica anterior intacta y marca desactualizado; el agente
aplica la politica cacheada tras arrancar sin red.

### Fase 7: Enforcement (solo lo aplicable en modo usuario)
**Objetivo**: USB (`allow`/`read_only`/`block` + allowlist por serial), web
(`blocked_domains`/`allowed_domains`/`block_webmail`), portapapeles (`allow`/`alert`/`block` +
`protected_sources`), impresion (`allow`/`log`/`block`). Cada intervencion emite su evento con el
campo `enforcement`. **`storage` queda en deteccion, no en prevencion** — ver "Riesgo principal".
**Validacion**: matriz de pruebas manuales por modo; lista vacia significa "sin restriccion" y NO
bloquea todo (regresion critica que dejaria al usuario sin poder trabajar).

### Fase 8: Latido, cuarentena, version y salud
**Objetivo**: latido con jitter, endurecimiento inmediato ante `quarantined: true`, consulta de
version, autodiagnostico y log local rotado.
**Validacion**: poner un equipo en cuarentena desde la consola endurece el endpoint en el siguiente
latido; el equipo pasa a `offline` en el panel al detener el servicio.

### Fase 9: Empaquetado, hardening y validacion final
**Objetivo**: MSI firmado con instalacion silenciosa, proteccion contra manipulacion (el usuario sin
privilegios no puede detener el servicio ni borrar la cola), y prueba E2E contra la consola.
**Validacion**:
- [ ] `go vet` y `go test ./...` pasan
- [ ] Despliegue en 3 equipos reales durante 24 h sin perdida de eventos ni 429
- [ ] Todos los criterios de exito verificados
- [ ] La consola muestra datos reales sin `demo_telemetry.sql`

---

## Aprendizajes (Self-Annealing)

> Se llena durante la implementacion. El mismo error nunca ocurre dos veces.

---

## Gotchas

- [x] ~~**El limite de tasa es por API KEY, no por equipo**~~ → RESUELTO: ahora es por equipo (120 req/min, 5 000 eventos/min). El de la organizacion (600/min) solo cuenta el alta.
- [ ] **El jitter sigue siendo obligatorio** aunque el cupo ya no sea compartido: doscientos equipos latiendo en el mismo segundo son un pico de doscientas peticiones concurrentes contra la funcion Serverless, no un problema de cupo.
- [ ] **`client_event_id` es obligatorio en cada evento** y debe SOBREVIVIR al reintento. Generarlo de nuevo al reenviar anula la deduplicacion y devuelve el problema al punto de partida.
- [ ] **La credencial del equipo se rota al re-enrolar.** Un agente que guarde la anterior en algun sitio y la reutilice recibira 401 sin explicacion aparente.
- [ ] **`occurred_at` debe ser RFC3339 con offset** (`z.string().datetime({ offset: true })`). En Go, `time.Format(time.RFC3339)`; un formato sin zona se rechaza con 400.
- [ ] **El servidor descarta silenciosamente eventos fuera de `[now-90d, now+5min]`** y los cuenta como `rejected`. Un reloj adelantado hace desaparecer telemetria sin error visible: sincronizar reloj y filtrar antes de enviar.
- [ ] **`title` se recorta en el servidor sin consentimiento** aunque el agente lo mande. El agente igual debe respetar `monitoring_allowed` — enviar dato personal que el servidor tira sigue siendo tratamiento de dato personal en transito.
- [ ] **Un lote con eventos rechazados devuelve 200**, no error. Hay que leer `rejected`/`details[]` o se dan por enviados eventos que nunca entraron.
- [ ] **La cuarentena es pegajosa**: reinstalar el agente no saca al equipo de ella. El agente no debe asumir que un re-enrolamiento lo devuelve a estado normal.
- [ ] **`profile_id` puede venir `null`** en el enroll (tenant sin perfil por defecto) y `/policy` devuelve `profile: null`. No es un error: es modo observacion.
- [ ] **Listas vacias en la politica significan "sin restriccion"**, no "bloquear todo". Invertirlo deja al usuario sin poder trabajar en cuanto alguien cree un perfil a medio configurar.
- [ ] **Normalizacion de rutas**: la consola guarda rutas sin barra final. La comparacion por prefijo debe normalizar igual o `D:\Compartido\` nunca coincidira.
- [ ] **`GET /api/agent/version` no lleva credencial** a proposito, y hoy devuelve `download_url`/`sha256` nulos. La auto-actualizacion NO debe descargar nada sin hash y firma verificados: el agente corre como LocalSystem.
- [ ] **`web_visit` lleva solo el host**, nunca la URL completa: la query string transporta tokens de sesion.

## Anti-Patrones

- NO enviar contenido: ni texto copiado, ni cuerpo de archivo, ni URL completa, ni captura de pantalla. Rutas, dominios, hashes, nombres y tamaños.
- NO meter el codigo Go en este repositorio Next.js.
- NO reintentar indefinidamente un 400 ni un 401: el primero nunca va a entrar, el segundo requiere intervencion humana.
- NO aplicar una politica de `schema_version` desconocida a medias.
- NO guardar la API key en el registro en claro, en un `.env`, ni pasarla como argumento del proceso.
- NO usar cola en memoria para la telemetria.
- NO confiar en que el servidor filtre lo invasivo: el agente aplica la misma regla en origen.

---

*PRP pendiente de aprobacion. No se ha modificado codigo.*
