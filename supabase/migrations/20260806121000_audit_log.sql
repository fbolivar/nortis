-- =============================================================================
-- Nortis | 10 - audit_log (registro administrativo inmutable)
-- =============================================================================
-- Requisito A.6.5: append-only, sin UPDATE ni DELETE.
--
-- La inmutabilidad se construye en TRES capas, porque cada una sola es
-- insuficiente:
--   1. RLS sin politicas de UPDATE/DELETE  -> detiene al usuario autenticado.
--   2. REVOKE UPDATE, DELETE incluso a service_role -> detiene tambien a un
--      Route Handler comprometido. Es la capa que de verdad importa: RLS no
--      aplica a service_role (tiene BYPASSRLS), pero los GRANT si.
--   3. Trigger BEFORE UPDATE OR DELETE que lanza excepcion -> ultima linea, y
--      deja rastro del intento en los logs de Postgres.
--
-- Un log de auditoria que el administrador puede editar no es un log de
-- auditoria. En una investigacion de fuga de informacion, el primer sospechoso
-- suele ser justamente quien tiene privilegios de consola.
-- =============================================================================

create table public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Nullable: acciones automaticas del sistema (jobs de retencion, webhooks) no
  -- tienen actor humano. ON DELETE SET NULL y no CASCADE: borrar al usuario
  -- jamas puede borrar la evidencia de lo que hizo.
  actor_user_id   uuid references public.users(id) on delete set null,
  -- Copia literal del correo al momento del hecho: si la cuenta se elimina,
  -- el registro sigue diciendo quien fue.
  actor_email     text,

  action          text not null,   -- policy.updated, api_key.revoked, consent.granted, ...
  target_table    text,
  target_id       text,

  -- Estado antes/despues del cambio. Es lo que permite responder "quien aflojo
  -- la politica de USB el viernes a las 6pm".
  before_state    jsonb,
  after_state     jsonb,

  ip_address      inet,
  user_agent      text,

  occurred_at     timestamptz not null default now()
);

create index audit_log_org_time_idx on public.audit_log (organization_id, occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);
create index audit_log_action_idx on public.audit_log (organization_id, action, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Capa 1 y 2: RLS + GRANTs
-- -----------------------------------------------------------------------------
alter table public.audit_log enable row level security;

revoke all on public.audit_log from anon, authenticated;
grant select, insert on public.audit_log to authenticated;

-- Ni siquiera el backend privilegiado puede alterar el historial.
revoke update, delete on public.audit_log from service_role;

create policy audit_log_select_admin
  on public.audit_log
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy audit_log_insert_same_org
  on public.audit_log
  for insert
  to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and (actor_user_id is null or actor_user_id = (select auth.uid()))
  );

-- Deliberadamente NO existen politicas FOR UPDATE ni FOR DELETE.

create policy audit_log_require_mfa
  on public.audit_log
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));

-- -----------------------------------------------------------------------------
-- Capa 3: trigger
-- -----------------------------------------------------------------------------
create or replace function public.reject_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log es inmutable: no se permite % ', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_is_immutable
  before update or delete on public.audit_log
  for each row execute function public.reject_audit_log_mutation();

-- =============================================================================
-- Registro automatico de cambios sensibles
-- =============================================================================
-- Se hace con triggers y no en el Route Handler porque un camino de escritura
-- que alguien olvide instrumentar es un cambio invisible. Colgado de la tabla,
-- no hay forma de modificar una politica sin que quede registrado.
create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_actor  uuid := (select auth.uid());
  v_email  text;
  v_action text;
begin
  -- Se accede a los campos via to_jsonb() y no como new.<campo>: este trigger es
  -- compartido por varias tablas, y plpgsql resuelve los campos de NEW/OLD al
  -- evaluar la expresion completa, sin cortocircuito. Un new.<campo> que no
  -- exista en la tabla que dispara el trigger revienta con "record new has no
  -- field", aunque la rama del CASE nunca se tome.
  v_org_id := coalesce(
    (case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'organization_id')
          else (to_jsonb(new) ->> 'organization_id') end)::uuid,
    (case when tg_table_name = 'organizations'
          then (case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')
                     else (to_jsonb(new) ->> 'id') end)::uuid end)
  );

  if v_org_id is null then
    return coalesce(new, old);
  end if;

  select u.email into v_email from public.users u where u.id = v_actor;

  v_action := tg_table_name || '.' || lower(tg_op);

  -- Caso especial: el consentimiento de monitoreo merece su propia accion, para
  -- poder filtrarlo en una auditoria sin leer diffs.
  -- El IF va ANIDADO por el mismo motivo que arriba: el acceso a
  -- new.monitoring_consent_signed_at solo puede compilarse cuando la tabla que
  -- dispara el trigger es organizations.
  if tg_table_name = 'organizations' and tg_op = 'UPDATE' then
    if new.monitoring_consent_signed_at is distinct from old.monitoring_consent_signed_at then
      v_action := case
        when new.monitoring_consent_signed_at is null then 'organizations.consent_revoked'
        else 'organizations.consent_granted'
      end;
    end if;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_email, action,
    target_table, target_id, before_state, after_state
  )
  values (
    v_org_id,
    v_actor,
    v_email,
    v_action,
    tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id') else (to_jsonb(new) ->> 'id') end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger security_profiles_audit
  after insert or update or delete on public.security_profiles
  for each row execute function public.log_admin_change();

create trigger endpoints_audit
  after update or delete on public.endpoints
  for each row execute function public.log_admin_change();

create trigger users_audit
  after update or delete on public.users
  for each row execute function public.log_admin_change();

create trigger organizations_audit
  after update on public.organizations
  for each row execute function public.log_admin_change();

create trigger encrypted_documents_audit
  after update or delete on public.encrypted_documents
  for each row execute function public.log_admin_change();

-- api_keys: el after_state incluiria key_hash en el jsonb. Se registra con una
-- funcion propia que lo elimina del diff — un log de auditoria no puede
-- convertirse en el sitio donde se filtra el secreto que la tabla original
-- protege con permisos de columna.
create or replace function public.log_api_key_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
begin
  select u.email into v_email from public.users u where u.id = v_actor;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_email, action,
    target_table, target_id, before_state, after_state
  )
  values (
    coalesce(new.organization_id, old.organization_id),
    v_actor,
    v_email,
    case
      when tg_op = 'INSERT' then 'api_key.created'
      when new.revoked_at is not null and old.revoked_at is null then 'api_key.revoked'
      else 'api_key.updated'
    end,
    'api_keys',
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else (to_jsonb(old) - 'key_hash') end,
    to_jsonb(new) - 'key_hash'
  );

  return new;
end;
$$;

create trigger api_keys_audit
  after insert or update on public.api_keys
  for each row execute function public.log_api_key_change();
