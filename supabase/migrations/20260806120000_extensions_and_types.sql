-- =============================================================================
-- Nortis | 00 - Extensiones y tipos base
-- =============================================================================
-- Este archivo NO crea tablas. Define el vocabulario del dominio (enums) para
-- que el resto de migraciones no dependa de columnas `text` sin validar.
--
-- Criterio: se usa enum (y no text + check) para todo dominio cerrado que el
-- agente de endpoint envia por API. Un enum hace que un payload con un
-- event_type desconocido falle en la escritura, no que se persista basura.
-- =============================================================================

create schema if not exists extensions;

-- pgcrypto: digest()/hmac() para hash de API keys y comparacion en tiempo
-- constante del lado servidor. gen_random_uuid() ya viene en pg_catalog (PG13+).
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Roles de consola
-- -----------------------------------------------------------------------------
-- owner  : dueño del tenant. Unico que puede transferir propiedad y borrar org.
-- admin  : opera politicas, endpoints, incidentes, API keys.
-- viewer : solo lectura (analista/auditor externo, contador de cumplimiento).
create type public.app_role as enum ('owner', 'admin', 'viewer');

-- -----------------------------------------------------------------------------
-- Plan comercial del tenant
-- -----------------------------------------------------------------------------
create type public.plan_tier as enum ('trial', 'starter', 'business', 'enterprise');

-- -----------------------------------------------------------------------------
-- Estado del endpoint
-- -----------------------------------------------------------------------------
-- online/offline se derivan de last_seen_at (ver endpoints.is_stale), pero se
-- persiste el estado para poder marcar 'quarantined' manualmente desde consola.
create type public.endpoint_status as enum ('online', 'offline', 'quarantined');

-- -----------------------------------------------------------------------------
-- Tipos de evento de telemetria
-- -----------------------------------------------------------------------------
-- Debe mantenerse sincronizado con el contrato JSON del agente Go
-- (repo nortis-agent, internal/collector). Agregar un valor nuevo requiere
-- migracion: `alter type public.event_type add value '...'`.
create type public.event_type as enum (
  'app_open',
  'file_created',
  'file_modified',
  'file_deleted',
  'usb_connected',
  'web_visit',
  'clipboard_copy',
  'print_job',
  'window_focus',
  'logon',
  'logoff',
  'idle_start',
  'idle_end'
);

-- -----------------------------------------------------------------------------
-- Incidentes DLP
-- -----------------------------------------------------------------------------
create type public.incident_severity as enum ('low', 'medium', 'high', 'critical');

-- Flujo de revision: open -> reviewed -> closed | false_positive
create type public.incident_status as enum ('open', 'reviewed', 'closed', 'false_positive');

-- -----------------------------------------------------------------------------
-- Cifrado
-- -----------------------------------------------------------------------------
-- internal : destinatario es usuario del mismo tenant (clave del tenant).
-- external : destinatario sin cuenta (clave publica efimera + credencial de un uso).
create type public.recipient_type as enum ('internal', 'external');

create type public.encryption_scheme as enum (
  'aes_256_gcm_tenant_key',   -- cifrado con la clave del tenant (Vault)
  'aes_256_gcm_ephemeral_rsa' -- clave AES efimera envuelta con RSA-OAEP del destinatario
);
