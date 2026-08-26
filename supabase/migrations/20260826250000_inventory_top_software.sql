-- =============================================================================
-- Nortis | Programas mas comunes de la flota (pagina Inventario sin buscar)
-- =============================================================================
-- Para que la pagina de Inventario no aparezca en blanco antes de escribir una
-- busqueda: muestra los programas mas instalados. SECURITY INVOKER para que la
-- RLS de endpoint_software (organizacion + sede) se aplique con los permisos del
-- usuario que consulta.
create or replace function public.inventory_top_software(p_limit integer default 30)
returns table(name text, devices bigint)
language sql stable security invoker set search_path = ''
as $$
  select s.name, count(distinct s.endpoint_id) as devices
  from public.endpoint_software s
  group by s.name
  order by devices desc, s.name
  limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;

revoke execute on function public.inventory_top_software(integer) from public, anon;
grant   execute on function public.inventory_top_software(integer) to authenticated;
