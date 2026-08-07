# Nortis — Base de datos

Esquema multi-tenant de la consola. Toda tabla con datos de cliente tiene RLS
activo desde el primer commit, en el **mismo archivo** que la crea.

## Estado

| | |
|---|---|
| Proyecto | `nortis` · ref `inshogremvtigfwqxqrt` · us-east-1 · ACTIVE_HEALTHY |
| Migraciones | **Aplicadas** (17) |
| Tests de aislamiento | **17/17 en verde**, ejecutados contra el proyecto real |
| Linter de seguridad | **0 errores.** Quedan WARN/INFO aceptados a conciencia (ver migración 12) |
| pg_cron | Habilitado, 3 jobs programados |

Los tests corren dentro de una transacción que siempre revierte: no dejan datos
de prueba en la base.

## Orden de migraciones

| Archivo | Contenido |
|---|---|
| `…120000_extensions_and_types.sql` | Extensiones y enums del dominio |
| `…120100_auth_helpers.sql` | `current_org_id()`, `is_org_admin()`, `mfa_satisfied()` |
| `…120200_organizations.sql` | Tenants + consentimiento de monitoreo |
| `…120300_users.sql` | Miembros de consola, roles, `bootstrap_organization()` |
| `…120400_security_profiles.sql` | Políticas (jsonb) + bloqueo por consentimiento |
| `…120500_endpoints.sql` | Inventario de equipos |
| `…120600_api_keys.sql` | Credenciales de agente + `resolve_api_key()` |
| `…120700_activity_events.sql` | Telemetría particionada + rollups + retención |
| `…120800_dlp_incidents.sql` | Cola de incidentes y flujo de revisión |
| `…120900_encrypted_documents.sql` | Metadatos de cifrado |
| `…121000_audit_log.sql` | Log inmutable + triggers de auditoría |
| `…121100_scheduled_jobs.sql` | Jobs pg_cron (particiones, rollup, purga) |
| `…121200_harden_partitions_and_trigger_functions.sql` | RLS en particiones + triggers fuera de la API REST |
| `…121300_create_api_key_rpc.sql` | `create_api_key()` — genera la credencial dentro de Postgres |
| `…121400_fix_api_key_audit_noise.sql` | El uso del agente deja de ensuciar `audit_log` |
| `…121500_tenant_offboarding_path.sql` | `purge_organization()` — baja de tenant |
| `…121600_silence_audit_during_purge.sql` | Los triggers de auditoría callan durante una purga |

El orden importa: los helpers se crean antes que las tablas que los usan, y
`security_profiles` antes que `endpoints` por la FK de perfil asignado.

## Decisiones que conviene no revertir sin pensarlo

**Helpers `SECURITY DEFINER`.** Sin ellos, la política RLS de `public.users`
tendría que leer `public.users` para evaluarse → recursión infinita (42P17).
Van con `set search_path = ''` y sin parámetros que permitan preguntar por otro
usuario.

**MFA enforzado en la base, no en el middleware.** Política `RESTRICTIVE` que
exige el claim `aal=aal2` a owner/admin. Si se filtrara la anon key, el
middleware de Next.js no existe pero la política sí. Excepción deliberada: la
propia fila en `public.users`, o un admin recién invitado quedaría en deadlock
(no entra sin MFA, no enrola MFA sin entrar).

**`activity_events` particionada por mes.** ~180 M filas/año para un tenant de
100 equipos. Purgar 90 días es `drop table` de una partición, no un `DELETE` de
decenas de millones de filas. Se consolida a `activity_daily_rollups` antes de
purgar, y `prune_activity_events()` **se niega** a dropear un mes sin agregados.

**Telemetría e incidentes son de solo lectura para los humanos.** Ni el owner
puede borrar eventos ni reescribir `rule_triggered`. En una investigación de
fuga, quien tiene la consola suele ser el primer sospechoso.

**Permisos a nivel de columna.** RLS filtra filas, no columnas. `api_keys.key_hash`
y `encrypted_documents.access_credential_hash` no se conceden a `authenticated`
en ningún caso.

**`audit_log` inmutable en tres capas:** sin políticas UPDATE/DELETE, `REVOKE`
incluso a `service_role` (los GRANT sí aplican a `service_role`, RLS no), y
trigger que lanza excepción.

**Consentimiento de monitoreo en la BD, no en un feature flag.** Un trigger
impide guardar un perfil con `window_titles` o `screenshots` activos si
`organizations.monitoring_consent_signed_at` es NULL — y cubre además la
revocación posterior del consentimiento. Ley 1581 de 2012.

## Puesta en marcha

```bash
supabase init                 # genera config.toml
supabase link --project-ref <REF>
supabase db push              # aplica migraciones
supabase test db              # suite RLS — debe pasar antes de construir UI
```

Después del primer despliegue: habilitar `pg_cron` en Dashboard → Database →
Extensions y ejecutar `select public.schedule_nortis_jobs();`.

**Generación de API keys dentro de Postgres.** `create_api_key()` produce el
secreto, lo hashea y devuelve el texto plano una sola vez, sin que pase por
código de aplicación ni por logs de Node. La consola no necesita la
`service_role` key para el Módulo 5. Como es `SECURITY DEFINER`, replica dentro
de la función lo que exigirían las políticas: rol admin **y** MFA.

**Baja de tenant.** `purge_organization()` (solo `service_role`) es la única vía
para borrar una organización. Sin ella, la inmutabilidad de `audit_log` hacía
imposible dar de baja a un cliente — bloqueando tanto la terminación de contrato
como el derecho de supresión (Ley 1581, art. 8).

## Pendiente

- `SUPABASE_SERVICE_ROLE_KEY` — sólo la necesitará la superficie `/api/agent`.
- Tabla de invitaciones — sin ella no se puede sumar un segundo usuario a una
  organización existente. No está en el modelo de A.3; decidir si entra.
- Clave de tenant en Supabase Vault para `encryption_scheme = aes_256_gcm_tenant_key`.
- La suite pgTAP de `tests/` sigue sin ejecutarse (requiere Docker). Sus
  aserciones sí se verificaron, como bloques `DO` equivalentes.
