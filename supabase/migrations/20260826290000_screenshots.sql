-- =============================================================================
-- Nortis | Captura de pantalla bajo consentimiento
-- =============================================================================
-- Guarda las capturas que el agente envia. SOLO llegan si el tenant firmo el
-- consentimiento y la politica trae screenshots=true; el RPC lo vuelve a exigir.
-- La imagen se guarda como bytea (volumen bajo, con consentimiento y acotado a
-- las ultimas por equipo); no se usa Storage para no introducir otra credencial.

create table if not exists public.screenshots (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.endpoints(id) on delete cascade,
  image           bytea not null,
  captured_at     timestamptz not null default now()
);

create index if not exists screenshots_endpoint_idx
  on public.screenshots (endpoint_id, captured_at desc);

alter table public.screenshots enable row level security;

drop policy if exists screenshots_select on public.screenshots;
create policy screenshots_select on public.screenshots
  for select using (organization_id = (select public.current_org_id()));

drop policy if exists screenshots_site_scope on public.screenshots;
create policy screenshots_site_scope on public.screenshots
  as restrictive for select to authenticated
  using (
    (select public.current_site_id()) is null
    or endpoint_id in (select e.id from public.endpoints e where e.site_id = (select public.current_site_id()))
  );

-- Reporte de una captura. Exige consentimiento firmado; sin el, se descarta en
-- silencio (defensa en profundidad: la consola ya no habria enviado el flag).
-- Se conservan las ultimas 20 por equipo para acotar el almacenamiento.
create or replace function public.agent_report_screenshot(
  p_credential text,
  p_image_base64 text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_auth record; v_consent timestamptz; v_id uuid;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  select o.monitoring_consent_signed_at into v_consent
    from public.organizations o where o.id = v_auth.organization_id;
  if v_consent is null then
    return; -- sin consentimiento: no se guarda nada
  end if;
  if coalesce(p_image_base64, '') = '' then
    return;
  end if;

  insert into public.screenshots (organization_id, endpoint_id, image)
  values (v_auth.organization_id, v_auth.endpoint_id, decode(p_image_base64, 'base64'))
  returning id into v_id;

  -- Retencion: conservar solo las 20 mas recientes de este equipo.
  delete from public.screenshots s
   where s.endpoint_id = v_auth.endpoint_id
     and s.id not in (
       select s2.id from public.screenshots s2
        where s2.endpoint_id = v_auth.endpoint_id
        order by s2.captured_at desc
        limit 20
     );
end;
$$;

revoke execute on function public.agent_report_screenshot(text, text) from public;
grant   execute on function public.agent_report_screenshot(text, text) to anon;

-- Lectura de una captura como base64, con la RLS del usuario (SECURITY INVOKER).
-- La ruta /api/screenshots/[id] la usa para servir el PNG.
create or replace function public.get_screenshot(p_id uuid)
returns text
language sql stable security invoker set search_path = ''
as $$
  select encode(s.image, 'base64') from public.screenshots s where s.id = p_id
$$;

revoke execute on function public.get_screenshot(uuid) from public, anon;
grant   execute on function public.get_screenshot(uuid) to authenticated;
