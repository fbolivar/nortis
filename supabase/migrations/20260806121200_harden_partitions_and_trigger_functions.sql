-- =============================================================================
-- Nortis | 12 - Blindaje de particiones y funciones de trigger
-- =============================================================================
-- Correcciones detectadas por el linter de seguridad de Supabase tras aplicar
-- el esquema. Se dejan como migracion aparte (y no reescribiendo la 07) para
-- conservar el historial: el error y su correccion son informacion util.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FIX 1 (CRITICO) — RLS en cada particion de activity_events
-- -----------------------------------------------------------------------------
-- Supuesto equivocado en la migracion 07: que habilitar RLS en la tabla padre
-- bastaba. Es cierto para consultas que pasan POR el padre, pero PostgREST
-- expone cada particion como una tabla mas del esquema public. Resultado:
--   /rest/v1/activity_events            -> respetaba RLS
--   /rest/v1/activity_events_2026_08    -> devolvia la telemetria de TODOS los
--                                          tenants a cualquiera con la anon key
--
-- Es la fuga entre clientes mas grave posible en este producto, y ninguna
-- politica RLS del padre la habria evitado. La atrapo `get_advisors`, no la
-- suite de tests: por eso el linter tiene que correr en cada PR, no una vez.
--
-- Se cierra por dos vias independientes:
--   a) REVOKE de los privilegios que Supabase concede por defecto a anon y
--      authenticated sobre toda tabla nueva de public.
--   b) ENABLE ROW LEVEL SECURITY sin ninguna politica -> deniega todo acceso
--      directo. El acceso via el padre sigue funcionando porque Postgres aplica
--      las politicas del padre e ignora las de las particiones en ese camino.
do $$
declare p record;
begin
  for p in
    select c.relname
      from pg_class c
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class par on par.oid = i.inhparent
     where par.relname = 'activity_events'
  loop
    execute format('revoke all on public.%I from anon, authenticated', p.relname);
    execute format('alter table public.%I enable row level security', p.relname);
  end loop;
end $$;

-- Toda particion futura nace blindada, en el mismo acto de crearla. Si esto
-- dependiera de acordarse de ejecutarlo aparte, el mes que se olvidara quedaria
-- expuesto — y el job de pg_cron crea particiones sin supervision humana.
create or replace function public.create_activity_events_partition(p_month date)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'activity_events_' || to_char(v_start, 'YYYY_MM');
begin
  if to_regclass('public.' || v_name) is not null then
    return v_name;
  end if;

  execute format(
    'create table public.%I partition of public.activity_events for values from (%L) to (%L)',
    v_name, v_start, v_end
  );

  execute format('revoke all on public.%I from anon, authenticated', v_name);
  execute format('alter table public.%I enable row level security', v_name);

  return v_name;
end;
$$;

revoke execute on function public.create_activity_events_partition(date) from public, anon, authenticated;
grant execute on function public.create_activity_events_partition(date) to service_role;

-- NOTA: el linter reporta las particiones como "RLS enabled, no policy" (nivel
-- INFO). Es el estado deseado, no un pendiente: sin politicas propias, el acceso
-- directo queda denegado y el unico camino de lectura es la tabla padre.

-- -----------------------------------------------------------------------------
-- FIX 2 — Funciones de trigger fuera de la API REST
-- -----------------------------------------------------------------------------
-- Son `returns trigger` y solo tienen sentido colgadas de una tabla, pero
-- Supabase las publica igual en /rest/v1/rpc/*. Los triggers se ejecutan con los
-- permisos del dueño de la tabla, asi que revocar EXECUTE no los afecta: solo
-- elimina superficie de API que nadie deberia poder tocar.
revoke execute on function public.enforce_monitoring_consent()          from public, anon, authenticated;
revoke execute on function public.enforce_user_update_rules()           from public, anon, authenticated;
revoke execute on function public.log_admin_change()                    from public, anon, authenticated;
revoke execute on function public.log_api_key_change()                  from public, anon, authenticated;
revoke execute on function public.stamp_incident_review()               from public, anon, authenticated;
revoke execute on function public.set_updated_at()                      from public, anon, authenticated;
revoke execute on function public.assert_consent_change_is_deliberate() from public, anon, authenticated;
revoke execute on function public.assert_profile_same_org()             from public, anon, authenticated;
revoke execute on function public.assert_event_tenant_matches()         from public, anon, authenticated;
revoke execute on function public.assert_incident_tenant_matches()      from public, anon, authenticated;
revoke execute on function public.assert_api_key_revocation_is_final()  from public, anon, authenticated;
revoke execute on function public.assert_document_revocation_is_final() from public, anon, authenticated;
revoke execute on function public.reject_audit_log_mutation()           from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Advertencias que se ACEPTAN a conciencia
-- -----------------------------------------------------------------------------
-- El linter marca como WARN que `authenticated` pueda ejecutar los helpers
-- SECURITY DEFINER (current_org_id, current_app_role, is_org_admin,
-- is_org_owner, mfa_satisfied) y bootstrap_organization. Es intencional:
--
--   - Los helpers son la base de TODA politica RLS; sin EXECUTE para
--     authenticated no habria control de acceso en absoluto. Ninguno recibe
--     parametros que permitan preguntar por otro usuario: siempre derivan de
--     auth.uid(), asi que llamarlos por RPC solo revela datos propios.
--   - bootstrap_organization solo puede actuar sobre el usuario de la sesion y
--     falla si ya pertenece a una organizacion.
