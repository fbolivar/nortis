-- =============================================================================
-- Nortis | El agente descarga las reglas de clasificacion por contenido
-- =============================================================================
-- Gateado por consentimiento: si el tenant no firmo la autorizacion de
-- tratamiento de datos, no se devuelven reglas y el agente no inspecciona
-- contenido (leer el contenido de un archivo es invasivo, como los titulos de
-- ventana). El agente evalua las reglas localmente y reporta solo la ETIQUETA.
create function public.agent_classifications(p_credential text)
returns table (name text, content_patterns text[])
language plpgsql security definer set search_path = ''
as $$
declare v_auth record; v_consent timestamptz;
begin
  select * into v_auth from public.agent_authenticate_endpoint(p_credential);
  perform public.check_agent_rate_limit(v_auth.endpoint_id, 0);

  select o.monitoring_consent_signed_at into v_consent
    from public.organizations o where o.id = v_auth.organization_id;
  if v_consent is null then
    return; -- sin consentimiento: sin inspeccion de contenido
  end if;

  return query
  select c.name, c.content_patterns
    from public.data_classifications c
   where c.organization_id = v_auth.organization_id
     and array_length(c.content_patterns, 1) > 0
   order by c.sort_order;
end;
$$;

revoke execute on function public.agent_classifications(text) from public, authenticated;
grant  execute on function public.agent_classifications(text) to anon;
