# PRP — Sedes y consolas delegadas

> **Estado:** en construccion (Fase 1)
> **Decisiones fijadas:**
> - Admin delegado (por sede) puede: ver todo de su sede, revisar incidentes/
>   cuarentena, asignar perfiles a sus equipos, y desplegar/reiniciar en su sede.
> - Gestion de sedes: central + delegado limitado (el delegado puede asignar
>   equipos de su sede; no crea sedes ni mueve usuarios).

## Objetivo

Pasar de una consola plana (todo owner/admin ve toda la organizacion) a una
jerarquia: una **consola central** que ve todo, y **consolas delegadas por sede**
que solo ven y gestionan lo suyo. Base tambien para estadisticas por sede.

## Modelo de datos

- `sites (id, organization_id, name)` — sedes por organizacion.
- `endpoints.site_id` — cada equipo pertenece a una sede (nullable = sin asignar).
- `users.site_id` — si esta puesto, el usuario es DELEGADO de esa sede (solo ve lo
  suyo); si es null, es CENTRAL (ve toda la organizacion, como hoy).

## Seguridad (el corazon del PRP)

El aislamiento por sede se impone en **RLS**, no en la UI. Nuevo helper
`current_site_id()` (el site_id del usuario actual, o null). Las politicas de cada
tabla con dimension de sede anaden, ADEMAS del filtro por organizacion:

    ... and (current_site_id() is null or <fila pertenece a esa sede>)

- `endpoints`: `site_id = current_site_id()`.
- `dlp_incidents`, `activity_events`, `agent_tasks`, `agent_commands`: pertenecen a
  un equipo; se filtran por el `site_id` de su endpoint.
- `security_profiles`: visibles a toda la organizacion (un delegado los ASIGNA
  pero no los crea).

Un central (site_id null) mantiene el comportamiento actual exacto. Todo cambio de
RLS se verifica con el suite de aislamiento (rls_tenant_isolation.test.sql +
casos nuevos de sede).

## Fases

1. **Modelo + organizacion (esta fase).** Tabla `sites`, `endpoints.site_id`,
   RPCs de gestion (crear/renombrar/borrar sede; asignar equipo a sede), y UI
   central para administrar sedes y asignar equipos. SIN cambios de RLS todavia:
   es puramente organizativo (habilita agrupar y, luego, las estadisticas por
   sede). No afirma ningun aislamiento que aun no exista.
2. **Delegacion + RLS.** `users.site_id`, `current_site_id()`, reescritura de las
   politicas RLS de las tablas con dimension de sede, y pruebas de aislamiento. Es
   la fase que crea de verdad el limite de la consola delegada.
3. **Capacidades delegadas + UI delegada.** Que un delegado pueda revisar
   incidentes/cuarentena, asignar perfiles y desplegar SOLO en su sede (chequeos
   de sede en los RPC correspondientes); asignar usuarios a sedes; conmutador de
   sede en la consola central; estadisticas por sede (items 15/16 del pliego).

## Criterios de aceptacion (global)

- [ ] Un usuario delegado de la sede A no ve equipos/incidentes/actividad de la
      sede B (probado en el suite de RLS).
- [ ] Un central sigue viendo toda la organizacion, sin cambios.
- [ ] Un delegado puede revisar incidentes, asignar perfiles y desplegar SOLO en
      su sede; los RPC rechazan un equipo de otra sede.
- [ ] typecheck/lint/build limpios; contrato del agente y aislamiento en verde.
