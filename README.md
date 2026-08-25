# Nortis

Consola de seguridad de la información para pymes. Un agente instalado en cada
equipo Windows reporta qué se hace con los archivos de la empresa; la consola
convierte esa actividad en inventario, incidentes de fuga de datos y evidencia
auditable, y devuelve a cada equipo la política que debe aplicar.

Multi-tenant desde el primer commit: cada organización ve exclusivamente sus
datos, y esa frontera la impone PostgreSQL con RLS, no el código de la
aplicación.

> **Estado.** La consola está construida y operativa. El agente de endpoint
> todavía no existe (ver [Qué falta](#qué-falta)), así que hoy el panel se
> alimenta del juego de datos de demostración `supabase/seed/demo_telemetry.sql`.

---

## Qué hace la consola

| Módulo | Para qué sirve |
|---|---|
| **Panel** | Estado de la flota, actividad por día y hora, aplicaciones y dominios más usados |
| **Actividad** | Búsqueda sobre la telemetría cruda y trazabilidad de un archivo concreto |
| **Equipos** | Inventario, últimos latidos, cuarentena y perfil de seguridad asignado |
| **Incidentes** | Cola de posibles fugas con severidad, revisión y cierre justificado |
| **Políticas** | Editor de perfiles, simulador de impacto previo al despliegue y asignación a equipos |
| **Bóveda** | Documentos cifrados **en el navegador** y envío a terceros con enlace de un solo uso |
| **Ajustes** | Usuarios de consola, credenciales de agente, consentimiento de monitoreo y registro de auditoría |

Tres roles: `owner`, `admin` y `viewer`. Los dos primeros están obligados a
segundo factor — y no como cortesía de la interfaz: sin `aal2`, la base les niega
todo dato del tenant.

## Cómo está construido

| Capa | Elección |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Datos y auth | Supabase (PostgreSQL + Auth + RLS + Storage + pg_cron) |
| Estilos | Tailwind CSS 3.4 |
| Validación | Zod, en el borde de cada entrada |
| Gráficas | Recharts |
| Móvil | PWA instalable con service worker |

### Tres decisiones que sostienen el producto

**La autorización vive en la base.** Las 12 tablas con datos de cliente tienen
RLS activo, declarado en el mismo archivo que crea la tabla. El layout de la
consola comprueba sesión, perfil y nivel de MFA, pero eso es defensa en
profundidad: aunque alguien se saltara ese layout, no obtendría una sola fila.

**No existe la clave `service_role`.** La superficie `/api/agent` se autentica
con la clave anónima y delega toda operación privilegiada en funciones
`SECURITY DEFINER` que validan la credencial del agente dentro de Postgres, de
modo que su autoridad queda acotada al tenant dueño de esa clave. En este
despliegue no hay ninguna credencial global que robar: un error de lógica en un
handler no puede exponer a otros clientes.

**La bóveda cifra en el cliente.** AES-256-GCM con cifrado por sobre en el
navegador ([crypto.ts](src/features/vault/services/crypto.ts)): el texto plano
nunca viaja por la red ni pasa por la memoria del servidor. Nortis custodia
documentos sin poder leerlos.

## Puesta en marcha

```bash
npm install
cp .env.local.example .env.local   # dos variables, ambas del panel de Supabase
npm run dev
```

Con un Supabase local (requiere Docker y la CLI de Supabase):

```bash
supabase start                                  # aplica supabase/migrations en orden
psql "$DB_URL" -f supabase/seed/demo_telemetry.sql   # datos de demostración
```

El esquema, el orden de las migraciones y las decisiones de diseño de la base
están documentados en [supabase/README.md](supabase/README.md).

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## API del agente

Contrato HTTP que consumirá el agente de endpoint. Vive bajo `/api/agent` y está
excluido de la sesión de usuario a propósito: el agente no inicia sesión, se
autentica con su credencial en cada petición.

| Ruta | Credencial | Para qué |
|---|---|---|
| `POST /api/agent/enroll` | Organización (`nrt_live_…`) | Alta del equipo; devuelve la credencial propia del endpoint |
| `POST /api/agent/events` | Equipo (`nrt_ep_…`) | Ingesta de telemetría por lotes, idempotente |
| `POST /api/agent/heartbeat` | Equipo | Presencia y detección de política obsoleta |
| `POST /api/agent/policy` | Equipo | Descarga del perfil vigente |
| `GET /api/agent/version` | Ninguna | Consulta de versión para la auto-actualización |

La credencial va **solo** por `Authorization: Bearer`, nunca por query string:
las query strings acaban en los logs de acceso de cualquier proxy.

El contrato está tipado en [`src/shared/schemas/`](src/shared/schemas/):
`agent-api.ts` (peticiones y respuestas), `telemetry.ts` (los 13 tipos de evento)
y `policy.ts` (el perfil de seguridad: almacenamiento, USB, web, portapapeles,
impresión, cifrado y monitoreo).

## Verificación

CI se ejecuta en cada PR hacia `main` y en cada push a `main`, en tres trabajos
independientes y **sin un solo secreto**:

1. **Lint, tipos y build.** El build compila sin variables de entorno: las claves
   se leen en tiempo de ejecución, así que CI no maneja credenciales — y lo que
   no existe no se puede filtrar en un log.
2. **Auditoría de dependencias.** `npm audit --audit-level=high`.
3. **Contrato del agente y aislamiento entre tenants.** Levanta un Supabase local
   y efímero dentro del runner, corre la suite pgTAP de aislamiento multi-tenant
   ([supabase/tests/](supabase/tests/)) y después el contrato HTTP completo
   contra la aplicación real ([tests/agent-api.test.mjs](tests/agent-api.test.mjs)).

El tercer trabajo existe porque un lint y un build compilan perfectamente una API
que ya no respeta sus propias invariantes. Si el contrato se rompe en un
refactor, hay que enterarse en el PR y no cuando doscientos equipos dejen de
reportar.

## Estructura

```
src/
├── app/
│   ├── (auth)/          # login, registro, onboarding, MFA, contraseñas
│   ├── (console)/       # la consola — un único punto de autorización en su layout
│   ├── api/agent/       # superficie del agente (sin sesión, con API key)
│   └── share/[token]/   # recepción pública de un documento compartido
│
├── features/            # una carpeta por dominio: auth, telemetry, incidents,
│                        # policies, vault, tenant
├── shared/              # componentes, esquemas Zod y tipos comunes
└── lib/supabase/        # clientes de navegador, servidor y proxy
```

`src/proxy.ts` protege por **exclusión**, no por inclusión: cualquier ruta nueva
nace protegida en lugar de esperar a que alguien se acuerde de añadirla a una
lista.

## Qué falta

**El agente de endpoint** ([PRP-001](.claude/PRPs/prp-agente-endpoint-windows.md),
Windows, Go). Es la pieza que cierra el circuito: sin él las políticas se editan
pero nadie las aplica, y el inventario no tiene fuente real.

Encadenado a eso, `/api/agent/version` devuelve `download_url` y `sha256` en nulo
**deliberadamente**: el agente corre con privilegios de sistema y reemplazaría su
propio binario por lo que hubiera al otro lado de esa URL. Publicar una descarga
sin firma ni hash sería peor que no publicar ninguna. Los campos ya están en el
contrato para que el agente los consuma desde el primer día.
