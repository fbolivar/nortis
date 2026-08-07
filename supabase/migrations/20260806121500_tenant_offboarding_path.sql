-- =============================================================================
-- Nortis | 15 - Baja de tenant sin debilitar la inmutabilidad del audit_log
-- =============================================================================
-- PROBLEMA DETECTADO EN PRUEBAS: el trigger de inmutabilidad rechaza tambien el
-- DELETE que llega por el ON DELETE CASCADE de organizations. Consecuencia: una
-- organizacion no se podia borrar JAMAS. Eso rompe dos cosas reales:
--   - la terminacion de contrato (el cliente se va y sus datos se quedan), y
--   - el derecho de supresion del titular (Ley 1581 de 2012, art. 8).
--
-- La solucion NO es aflojar la inmutabilidad. Se abre una unica puerta,
-- explicita y acotada:
--   - UPDATE sigue prohibido siempre, sin excepcion.
--   - DELETE solo se admite si la sesion trae la marca nortis.purge_organization
--     con el ID EXACTO del tenant de esa fila. Un borrado en masa no puede
--     arrastrar asientos de otros clientes ni por error ni por descuido.
--   - La marca solo la puede poner purge_organization(), reservada a
--     service_role. Un admin de consola no tiene forma de activarla.
create or replace function public.reject_audit_log_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('nortis.purge_organization', true), '') = old.organization_id::text then
    return old;
  end if;

  raise exception 'audit_log es inmutable: no se permite %', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

revoke execute on function public.reject_audit_log_mutation() from public, anon, authenticated;

-- Baja definitiva de un tenant. Irreversible.
create or replace function public.purge_organization(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  select exists (select 1 from public.organizations where id = p_org_id) into v_exists;
  if not v_exists then
    raise exception 'La organizacion % no existe', p_org_id;
  end if;

  -- is_local = true: la marca muere con la transaccion. Si el DELETE falla, no
  -- queda una sesion con permiso de borrado latente.
  perform set_config('nortis.purge_organization', p_org_id::text, true);

  -- El resto cae por ON DELETE CASCADE: users, endpoints, security_profiles,
  -- api_keys, activity_events, dlp_incidents, encrypted_documents y audit_log.
  delete from public.organizations where id = p_org_id;
end;
$$;

comment on function public.purge_organization(uuid) is
  'Baja definitiva de un tenant (terminacion de contrato o derecho de supresion). Solo service_role. Irreversible.';

revoke execute on function public.purge_organization(uuid) from public, anon, authenticated;
grant   execute on function public.purge_organization(uuid) to service_role;
