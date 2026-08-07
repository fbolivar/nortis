-- =============================================================================
-- Nortis | 14 - El uso del agente no es un evento de auditoria
-- =============================================================================
-- resolve_api_key() actualiza last_used_at en CADA peticion del agente, y el
-- trigger de auditoria convertia cada una de esas escrituras en una fila de
-- audit_log. Con 100 endpoints sincronizando cada minuto son ~144.000 filas
-- diarias de ruido, en una tabla que ademas es inmutable y por tanto imposible
-- de limpiar. El log de auditoria dejaria de ser legible justo cuando hace
-- falta leerlo — en una investigacion.
--
-- Se audita la administracion (alta, revocacion, renombrado), no la telemetria
-- de uso: last_used_at ya vive en la propia tabla api_keys.
create or replace function public.log_api_key_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'api_key.created';
  elsif new.revoked_at is not null and old.revoked_at is null then
    v_action := 'api_key.revoked';
  elsif (to_jsonb(new) - 'last_used_at') = (to_jsonb(old) - 'last_used_at') then
    -- El unico cambio fue last_used_at: es uso del agente, no administracion.
    return new;
  else
    v_action := 'api_key.updated';
  end if;

  select u.email into v_email from public.users u where u.id = v_actor;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_email, action,
    target_table, target_id, before_state, after_state
  )
  values (
    coalesce(new.organization_id, old.organization_id),
    v_actor, v_email, v_action, 'api_keys',
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else (to_jsonb(old) - 'key_hash') end,
    to_jsonb(new) - 'key_hash'
  );

  return new;
end;
$$;

revoke execute on function public.log_api_key_change() from public, anon, authenticated;
