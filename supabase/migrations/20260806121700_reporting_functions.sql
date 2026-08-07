-- =============================================================================
-- Nortis | 17 - Funciones de reporte del Modulo 1
-- =============================================================================
-- Las agregaciones se hacen en Postgres, no en JavaScript. Traer 200.000 filas
-- al servidor de Next.js para contarlas alli funcionaria hoy con datos de
-- demostracion y se caeria con un cliente real: es exactamente el motivo por el
-- que activity_events esta particionada.
--
-- Todas son SECURITY INVOKER (el modo por defecto, aqui explicito): se ejecutan
-- con los permisos de quien llama, asi que RLS filtra por organizacion sin que
-- ninguna funcion tenga que acordarse de añadir el WHERE. Convertirlas en
-- SECURITY DEFINER seria un agujero multi-tenant inmediato.
--
-- Todas acotan por rango de fechas para que el planner pueda podar particiones.

-- Actividad por hora del dia (grafico de barras del Modulo 1).
create or replace function public.report_activity_by_hour(p_days integer default 7)
returns table (hour integer, event_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select extract(hour from e.occurred_at)::integer as hour,
         count(*)::bigint                          as event_count
    from public.activity_events e
   where e.occurred_at >= (now() - make_interval(days => p_days))
   group by 1
   order by 1;
$$;

-- Actividad por dia (serie de tiempo).
create or replace function public.report_activity_by_day(p_days integer default 14)
returns table (day date, event_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select e.occurred_at::date as day,
         count(*)::bigint    as event_count
    from public.activity_events e
   where e.occurred_at >= (now() - make_interval(days => p_days))
   group by 1
   order by 1;
$$;

-- Uso por categoria de software (grafico de torta).
create or replace function public.report_usage_by_category(p_days integer default 7)
returns table (category text, event_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select coalesce(e.payload ->> 'category', 'sin clasificar') as category,
         count(*)::bigint                                     as event_count
    from public.activity_events e
   where e.occurred_at >= (now() - make_interval(days => p_days))
     and e.event_type = 'app_open'
   group by 1
   order by 2 desc;
$$;

-- Aplicaciones mas usadas.
create or replace function public.report_top_apps(p_days integer default 7, p_limit integer default 10)
returns table (app text, event_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select e.payload ->> 'app' as app,
         count(*)::bigint    as event_count
    from public.activity_events e
   where e.occurred_at >= (now() - make_interval(days => p_days))
     and e.event_type in ('app_open', 'window_focus')
     and e.payload ->> 'app' is not null
   group by 1
   order by 2 desc
   limit greatest(1, least(p_limit, 50));
$$;

-- Sitios mas visitados.
create or replace function public.report_top_domains(p_days integer default 7, p_limit integer default 10)
returns table (domain text, event_count bigint, blocked_count bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select e.payload ->> 'domain'                                            as domain,
         count(*)::bigint                                                  as event_count,
         count(*) filter (where (e.payload ->> 'blocked')::boolean)::bigint as blocked_count
    from public.activity_events e
   where e.occurred_at >= (now() - make_interval(days => p_days))
     and e.event_type = 'web_visit'
     and e.payload ->> 'domain' is not null
   group by 1
   order by 2 desc
   limit greatest(1, least(p_limit, 50));
$$;

-- Trazabilidad de archivos: busqueda por fragmento de ruta.
--
-- El filtro va aqui y no en el cliente para no traer al navegador rutas de toda
-- la organizacion y descartarlas alli — seria enviar datos que el analista no
-- pidio. El acotado por fecha es obligatorio: sin el, la busqueda recorre todas
-- las particiones vivas.
--
-- LIMITACION CONOCIDA: el ILIKE no usa el indice GIN de payload (que sirve al
-- operador @>). Con retencion de 90 dias y filtro de fechas es aceptable, pero
-- si la busqueda de rutas se vuelve una funcion central habra que añadir un
-- indice trigram sobre (payload ->> 'path').
create or replace function public.search_file_activity(
  p_query    text,
  p_days     integer default 30,
  p_endpoint uuid default null,
  p_user     text default null,
  p_limit    integer default 200
)
returns table (
  id           uuid,
  endpoint_id  uuid,
  hostname     text,
  event_type   public.event_type,
  path         text,
  file_user    text,
  process      text,
  size_bytes   bigint,
  occurred_at  timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $$
  select e.id,
         e.endpoint_id,
         ep.hostname,
         e.event_type,
         e.payload ->> 'path'                 as path,
         e.payload ->> 'user'                 as file_user,
         e.payload ->> 'process'              as process,
         (e.payload ->> 'size_bytes')::bigint as size_bytes,
         e.occurred_at
    from public.activity_events e
    join public.endpoints ep on ep.id = e.endpoint_id
   where e.occurred_at >= (now() - make_interval(days => p_days))
     and e.event_type in ('file_created', 'file_modified', 'file_deleted')
     and (p_query    is null or p_query = '' or e.payload ->> 'path' ilike '%' || p_query || '%')
     and (p_endpoint is null or e.endpoint_id = p_endpoint)
     and (p_user     is null or p_user = ''  or e.payload ->> 'user' = p_user)
   order by e.occurred_at desc
   limit greatest(1, least(p_limit, 1000));
$$;

revoke execute on function public.report_activity_by_hour(integer)     from public, anon;
revoke execute on function public.report_activity_by_day(integer)      from public, anon;
revoke execute on function public.report_usage_by_category(integer)    from public, anon;
revoke execute on function public.report_top_apps(integer, integer)    from public, anon;
revoke execute on function public.report_top_domains(integer, integer) from public, anon;
revoke execute on function public.search_file_activity(text, integer, uuid, text, integer) from public, anon;

grant execute on function public.report_activity_by_hour(integer)      to authenticated;
grant execute on function public.report_activity_by_day(integer)       to authenticated;
grant execute on function public.report_usage_by_category(integer)     to authenticated;
grant execute on function public.report_top_apps(integer, integer)     to authenticated;
grant execute on function public.report_top_domains(integer, integer)  to authenticated;
grant execute on function public.search_file_activity(text, integer, uuid, text, integer) to authenticated;
