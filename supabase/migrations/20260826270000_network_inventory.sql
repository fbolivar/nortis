-- =============================================================================
-- Nortis | Inventario de red: IP publica del equipo
-- =============================================================================
-- El agente reporta su red local (interfaces, WiFi) dentro de hardware_info. La
-- IP PUBLICA no la sabe el agente —esta detras de NAT—; la ve el servidor en el
-- origen de la peticion y la anota aqui. Es la base de la geolocalizacion por IP.

alter table public.endpoints
  add column if not exists public_ip text,
  add column if not exists public_ip_at timestamptz;

grant select (public_ip, public_ip_at) on public.endpoints to authenticated;

-- Se reescribe el RPC de inventario para aceptar la IP publica (opcional). La
-- pasa la ruta /api/agent/inventory leyendo la cabecera de origen. Se dropea la
-- firma anterior de 3 argumentos para no dejar dos versiones ambiguas.
drop function if exists public.agent_report_inventory(text, jsonb, jsonb);

create or replace function public.agent_report_inventory(
  p_credential text,
  p_hardware jsonb,
  p_software jsonb,
  p_ip text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_auth record;
        v_ip text := nullif(trim(coalesce(p_ip, '')), '');
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  update public.endpoints
     set hardware_info = p_hardware,
         inventory_at = now(),
         public_ip = coalesce(v_ip, public_ip),
         public_ip_at = case when v_ip is not null then now() else public_ip_at end
   where id = v_auth.endpoint_id;

  delete from public.endpoint_software where endpoint_id = v_auth.endpoint_id;

  insert into public.endpoint_software (organization_id, endpoint_id, name, version, publisher)
  select v_auth.organization_id, v_auth.endpoint_id,
         left(elem ->> 'name', 300), left(elem ->> 'version', 100), left(elem ->> 'publisher', 200)
    from (
      select value as elem from jsonb_array_elements(coalesce(p_software, '[]'::jsonb))
       where coalesce(value ->> 'name', '') <> ''
       limit 3000
    ) s;
end;
$$;

revoke execute on function public.agent_report_inventory(text, jsonb, jsonb, text) from public;
grant   execute on function public.agent_report_inventory(text, jsonb, jsonb, text) to anon;
