# PRP — Ejecución remota administrada (canal de comandos SYSTEM)

> **Estado:** propuesto, pendiente de aprobación
> **Decisiones fijadas:** producto comercial · modo usuario · este es el keystone
> **Keystone:** un solo cimiento que desbloquea ~12 ítems del pliego (despliegue de
> software, parches, automatización, programador de tareas, distribución y
> transferencia de archivos) **sin driver de kernel**.

---

## 1. Objetivo

Dar a la consola la capacidad de **encargar acciones administrativas** que el
agente ejecuta con privilegios de SYSTEM en el equipo, de forma **segura,
firmada y auditada**. Reutiliza el patrón ya existente de `agent_commands`
(cuarentena) y la verificación de firma Ed25519 que el agente ya hace para los
vales anti-manipulación.

## 2. Por qué ahora / por qué esto primero

- El agente **ya corre como servicio SYSTEM**, ya tiene **canal de comandos**
  (`agent_commands` + `poll`/`report`) y ya **verifica firmas Ed25519 de la
  consola** (`internal/tamper`). Tres de las cuatro piezas difíciles existen.
- Un solo canal genérico habilita, en cascada: instalar/actualizar software (9,
  13), parches, automatización (6), programador de tareas y apagado (4),
  distribución y transferencia de archivos (11, 12).

## 3. Modelo de seguridad (lo NO negociable)

Ejecutar como SYSTEM en la flota es la capacidad más peligrosa del producto. Los
controles son el producto:

1. **Todo comando va FIRMADO por la consola (Ed25519).** El agente **rechaza**
   cualquier tarea sin firma válida sobre su payload canónico. Consecuencia: aun
   si alguien compromete la base de datos o la API y **inyecta** una fila, el
   agente **no la ejecuta** — no tiene la clave privada. Esta es la propiedad
   central.
2. **Emitir exige admin + segundo factor (MFA)**, igual que
   `create_quarantine_action`. La clave privada de firma vive en el servidor,
   nunca en el navegador ni en el repo.
3. **Catálogo cerrado de acciones (allowlist), no shell arbitrario.** v1 no
   acepta "ejecuta esta cadena". Acepta acciones tipadas y validadas (ver §5).
4. **Verificación de integridad del artefacto.** Todo binario/archivo se
   descarga por HTTPS y se valida **sha256** antes de ejecutar. Sin match, no se
   ejecuta.
5. **Auditoría completa e inmutable.** Quién emitió, qué, cuándo, a qué equipos,
   y el resultado (exit code, stdout/stderr truncado, error). Visible en consola.
6. **Idempotencia y timeout.** Cada tarea se marca `sent` atómicamente al
   entregarse (como cuarentena), se ejecuta una vez, con límite de tiempo.
7. **Reversibilidad de la superficie:** el catálogo se amplía por versiones; una
   acción nueva (p. ej. `run_script`) entra detrás de bandera y con su propia
   revisión de seguridad.

> Riesgo residual asumido: una cuenta admin comprometida **con** MFA = control de
> la flota. Es inherente a la capacidad. Mitigación: recomendar MFA por hardware
> a los admin y registrar cada emisión.

## 4. Alcance

**Dentro (v1):**
- Tabla `agent_tasks` + RPCs (`issue_agent_task` admin+MFA, `agent_poll_tasks`,
  `agent_report_task`).
- Firma Ed25519 del payload en el servidor; verificación en el agente.
- Acciones: `install_msi`, `push_file`, `restart`. (Ver §5.)
- Fan-out: una tarea puede apuntar a **N equipos** (despliegue masivo).
- UI de consola: emitir tarea (elegir equipos + acción), ver estado y resultados.

**Fuera (por ahora):**
- `run_script` (PowerShell/batch firmado) → Fase 3, tras revisión dedicada.
- Programador/cron de tareas (item 4) → Fase 3.
- Control remoto interactivo + chat (item 19) → decisión y PRP aparte.
- Nada de modo kernel.

## 5. Catálogo de acciones v1

| Acción | Payload | Efecto | Habilita |
|---|---|---|---|
| `install_msi` | `url`, `sha256`, `args?` | Descarga MSI, valida sha, `msiexec /qn` | 9, 13 (deploy/parches) |
| `push_file` | `url`, `sha256`, `dest_path` | Descarga y coloca archivo en el equipo | 11, 12 (distribución/transferencia) |
| `restart` | — | Reinicia el equipo (con aviso) | mantenimiento |

Fase 3 (detrás de bandera): `run_script` (script firmado por la consola),
`shutdown`, `run_catalog_action` (mantenimiento predefinido), y programación
temporal.

## 6. Modelo de datos (borrador)

`public.agent_tasks`:
- `id`, `organization_id`, `endpoint_id`, `kind` (enum), `payload jsonb`,
  `signature text` (Ed25519 sobre el payload canónico), `status`
  (`pending|sent|running|done|failed`), `exit_code int`, `output text`,
  `error text`, `created_by`, `created_at`, `sent_at`, `completed_at`.
- Índice parcial por `endpoint_id where status='pending'`.
- RLS: lectura para miembros del tenant; escritura solo por los RPC.

## 7. Fases

1. **Cimiento firmado.** DB + RPCs + firma en servidor + verificación/ejecución
   en agente + `install_msi`. Criterio: un `install_msi` firmado instala en N
   equipos con sha verificado y reporta resultado; una fila **inyectada sin
   firma** es **rechazada** por el agente (test de seguridad explícito).
2. **UI + push_file + restart.** Pantalla "Tareas/Despliegue": elegir equipos,
   acción, ver estado y salida. Distribución/transferencia de archivos.
3. **run_script firmado + programador (cron) + apagado.** Automatización (6),
   scheduler (4). Cada uno con su revisión.

## 8. Criterios de aceptación (v1)

- [ ] Emitir `install_msi` a ≥2 equipos desde la consola (admin+MFA) despliega el
      MSI y muestra exit code + salida por equipo.
- [ ] El agente **rechaza y reporta** una tarea con firma inválida o sha que no
      coincide (probado en test).
- [ ] Auditoría: cada tarea registra quién/qué/cuándo/resultado.
- [ ] `typecheck`, `lint`, build de agente y consola limpios; contrato agente y
      aislamiento entre tenants en verde.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| RCE por diseño | Firma obligatoria + catálogo cerrado + admin/MFA + auditoría |
| Cuenta admin comprometida | MFA por hardware recomendado; toda emisión auditada |
| Artefacto manipulado | sha256 obligatorio antes de ejecutar |
| Inyección en BD/API | El agente solo ejecuta lo firmado con la clave privada del servidor |
| MSI que rompe el equipo | Empezar por despliegue a grupos pequeños; resultado por equipo antes de ampliar |
