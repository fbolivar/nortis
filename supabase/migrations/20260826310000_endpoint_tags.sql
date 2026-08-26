-- =============================================================================
-- Nortis | Etiquetas de equipos
-- =============================================================================
-- Etiquetas libres por equipo (p. ej. 'contabilidad', 'gerencia') para organizar
-- y filtrar la flota mas alla de las sedes. La escritura es de admin, via RPC.

alter table public.endpoints add column if not exists tags text[] not null default '{}';

-- La tabla endpoints tiene grants a nivel de columna; hay que conceder tags.
grant select (tags), update (tags) on public.endpoints to authenticated;

create or replace function public.set_endpoint_tags(p_endpoint_id uuid, p_tags text[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := (select public.current_org_id());
        v_site uuid := (select public.current_site_id());
        v_clean text[];
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'solo un administrador puede etiquetar equipos';
  end if;
  v_clean := array(
    select distinct lower(trim(x)) from unnest(coalesce(p_tags,'{}')) as x
     where trim(x) <> '' and length(trim(x)) <= 40
  );
  if array_length(v_clean,1) > 20 then
    raise exception 'demasiadas etiquetas (maximo 20)';
  end if;

  update public.endpoints
     set tags = v_clean
   where id = p_endpoint_id and organization_id = v_org
     and (v_site is null or site_id = v_site);
  if not found then
    raise exception 'equipo no encontrado';
  end if;
end;
$$;
revoke execute on function public.set_endpoint_tags(uuid, text[]) from public, anon;
grant   execute on function public.set_endpoint_tags(uuid, text[]) to authenticated;
