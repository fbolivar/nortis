-- =============================================================================
-- Nortis | 16 - Los triggers de auditoria callan durante una purga de tenant
-- =============================================================================
-- Segundo problema en cadena del anterior: al borrar una organizacion, el
-- ON DELETE CASCADE elimina users, endpoints, security_profiles, api_keys y
-- encrypted_documents. Cada uno de esos borrados disparaba su trigger de
-- auditoria, que intentaba INSERTAR en audit_log una fila apuntando a la
-- organizacion que se esta eliminando en esa misma operacion -> violacion de
-- clave foranea, y purga imposible.
--
-- Registrar la desaparicion de un tenant DENTRO del propio tenant no tiene
-- sentido: esas filas se borran acto seguido. La constancia de la baja
-- pertenece a un registro externo (facturacion, contrato), no a audit_log.
create or replace function public.log_admin_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id uuid;
  v_actor  uuid := (select auth.uid());
  v_email  text;
  v_action text;
begin
  -- Acceso por to_jsonb() y no como new.<campo>: este trigger es compartido por
  -- varias tablas y plpgsql resuelve los campos de NEW/OLD al evaluar la
  -- expresion completa, sin cortocircuito.
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

  -- Purga en curso de este mismo tenant: no se audita.
  if coalesce(current_setting('nortis.purge_organization', true), '') = v_org_id::text then
    return coalesce(new, old);
  end if;

  select u.email into v_email from public.users u where u.id = v_actor;

  v_action := tg_table_name || '.' || lower(tg_op);

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
    v_org_id, v_actor, v_email, v_action, tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id') else (to_jsonb(new) ->> 'id') end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.log_api_key_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id uuid := coalesce(new.organization_id, old.organization_id);
  v_actor  uuid := (select auth.uid());
  v_email  text;
  v_action text;
begin
  if coalesce(current_setting('nortis.purge_organization', true), '') = v_org_id::text then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_action := 'api_key.created';
  elsif new.revoked_at is not null and old.revoked_at is null then
    v_action := 'api_key.revoked';
  elsif (to_jsonb(new) - 'last_used_at') = (to_jsonb(old) - 'last_used_at') then
    -- Solo cambio last_used_at: es uso del agente, no administracion.
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
    v_org_id, v_actor, v_email, v_action, 'api_keys',
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else (to_jsonb(old) - 'key_hash') end,
    to_jsonb(new) - 'key_hash'
  );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.log_admin_change()   from public, anon, authenticated;
revoke execute on function public.log_api_key_change() from public, anon, authenticated;
