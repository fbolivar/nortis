-- =============================================================================
-- Nortis | 25 - Limite de tasa de la API del agente
-- =============================================================================
-- Requisito A.6.4. Vive en la BASE y no solo en el Route Handler a proposito:
-- las funciones del agente son invocables por PostgREST, asi que un limite que
-- solo existiera en el codigo de Next.js se saltaria llamando directo al RPC.
-- El control tiene que estar donde esta el dato.
--
-- Ventana fija por minuto. No reparte capacidad con tanta justicia como una
-- ventana deslizante, pero se resuelve con un upsert — y el objetivo aqui no es
-- la equidad, es que un agente comprometido no pueda inundar la ingesta de los
-- demas clientes.
create table if not exists public.agent_rate_limits (
  api_key_id    uuid not null references public.api_keys(id) on delete cascade,
  window_start  timestamptz not null,
  request_count integer not null default 0,
  event_count   integer not null default 0,
  primary key (api_key_id, window_start)
);

alter table public.agent_rate_limits enable row level security;
-- Sin politicas: nadie la lee ni la escribe directamente. Solo la tocan las
-- funciones SECURITY DEFINER.
revoke all on public.agent_rate_limits from anon, authenticated;

create index if not exists agent_rate_limits_window_idx
  on public.agent_rate_limits (window_start);

-- Limites por clave y minuto. Un parque de 200 equipos sincronizando cada minuto
-- con una sola clave cabe de sobra; un agente en bucle, no.
create or replace function public.check_agent_rate_limit(
  p_api_key_id uuid, p_events integer default 0
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  c_max_requests constant integer := 600;
  c_max_events   constant integer := 50000;
  v_window timestamptz := date_trunc('minute', now());
  v_requests integer;
  v_events   integer;
begin
  insert into public.agent_rate_limits (api_key_id, window_start, request_count, event_count)
  values (p_api_key_id, v_window, 1, p_events)
  on conflict (api_key_id, window_start) do update
    set request_count = public.agent_rate_limits.request_count + 1,
        event_count   = public.agent_rate_limits.event_count + p_events
  returning request_count, event_count into v_requests, v_events;

  if v_requests > c_max_requests or v_events > c_max_events then
    -- 429 al otro lado. El agente debe reintentar con retroceso exponencial, no
    -- insistir: por eso el error es distinguible de un fallo de validacion.
    raise exception 'Limite de tasa excedido para esta credencial' using errcode = '53400';
  end if;
end;
$$;

-- Sin esta limpieza la tabla crece indefinidamente: una fila por clave y minuto.
create or replace function public.prune_agent_rate_limits()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_deleted integer;
begin
  delete from public.agent_rate_limits where window_start < now() - interval '2 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.check_agent_rate_limit(uuid, integer) from public, anon, authenticated;
revoke execute on function public.prune_agent_rate_limits()             from public, anon, authenticated;
