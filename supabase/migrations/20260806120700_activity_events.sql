-- =============================================================================
-- Nortis | 07 - activity_events (telemetria cruda, particionada por fecha)
-- =============================================================================
-- DIMENSIONAMIENTO (justificacion del particionamiento, requisito A.3)
--
-- Un endpoint de oficina genera del orden de 3.000-8.000 eventos/dia entre
-- trazabilidad de archivos, foco de ventana, navegacion y sesion. Para un tenant
-- de 100 equipos:
--     100 x 5.000 = 500.000 eventos/dia  ~= 15.000.000/mes  ~= 180.000.000/año
-- A ~400 bytes por fila con payload jsonb, eso son ~6 GB/año de un solo cliente,
-- sin contar indices (que en esta tabla pesan casi tanto como los datos).
--
-- Consecuencias si esto fuera una tabla plana:
--   - Borrar telemetria vencida seria un DELETE de decenas de millones de filas:
--     horas de bloqueo, bloat masivo y un autovacuum que nunca alcanza.
--   - Todo indice sobre la tabla completa deja de caber en memoria y las
--     consultas del dashboard (siempre acotadas a un rango de fechas) degradan.
--
-- Con particionamiento mensual por rango:
--   - Purgar 90 dias es `drop table` de una particion: instantaneo, sin bloat.
--   - El planner hace partition pruning y solo toca los meses consultados.
--
-- POLITICA DE RETENCION (ver funciones al final del archivo):
--   - Detalle crudo: 90 dias  -> particiones mensuales, se dropean al vencer.
--   - Agregados diarios: indefinido -> activity_daily_rollups (2 ordenes de
--     magnitud mas pequeño; es lo que alimenta los reportes historicos).
-- Consolidar antes de purgar no es opcional: es lo que permite responder "uso
-- por categoria de software en 2025" sin conservar 180 millones de filas.
-- =============================================================================

create table public.activity_events (
  id              uuid not null default gen_random_uuid(),

  -- DESNORMALIZACION DELIBERADA: organization_id se puede derivar de
  -- endpoints.endpoint_id, pero la politica RLS se evalua POR FILA. Sin esta
  -- columna, cada fila leida dispararia un subselect contra endpoints —
  -- inaceptable en una tabla de esta cardinalidad. La integridad la sostiene el
  -- trigger de mas abajo.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.endpoints(id) on delete cascade,

  event_type      public.event_type not null,
  payload         jsonb not null default '{}'::jsonb,

  -- Momento del hecho en el reloj del endpoint.
  occurred_at     timestamptz not null,
  -- Momento en que la API lo persistio. La diferencia contra occurred_at revela
  -- equipos que estuvieron sin red (cola offline drenando) y tambien equipos con
  -- el reloj manipulado — señal forense por si sola.
  ingested_at     timestamptz not null default now(),

  -- La clave de particion DEBE formar parte de la PK en una tabla particionada.
  primary key (id, occurred_at),

  constraint activity_events_payload_is_object check (jsonb_typeof(payload) = 'object')
) partition by range (occurred_at);

comment on table public.activity_events is
  'Telemetria cruda del agente. Particionada por mes. Retencion 90 dias; el historico vive agregado en activity_daily_rollups.';

-- -----------------------------------------------------------------------------
-- Indices
-- -----------------------------------------------------------------------------
-- Definidos sobre la tabla padre: Postgres los propaga a toda particion, actual
-- y futura, sin que haya que recordarlo al crear cada mes.

-- Consulta base del dashboard: "actividad de mi organizacion en un rango".
create index activity_events_org_time_idx
  on public.activity_events (organization_id, occurred_at desc);

-- Linea de tiempo de un endpoint concreto (vista de detalle).
create index activity_events_endpoint_time_idx
  on public.activity_events (endpoint_id, occurred_at desc);

-- Reportes por categoria (torta de uso de software, top sitios).
create index activity_events_type_time_idx
  on public.activity_events (organization_id, event_type, occurred_at desc);

-- Trazabilidad de archivos: buscador por ruta dentro del payload.
-- jsonb_path_ops en vez de la clase por defecto: indice ~3x mas pequeño y mas
-- rapido para el operador @>, que es el unico que usa el buscador.
create index activity_events_payload_idx
  on public.activity_events using gin (payload jsonb_path_ops);

-- -----------------------------------------------------------------------------
-- Coherencia de tenant
-- -----------------------------------------------------------------------------
-- Cierra el riesgo que abre la desnormalizacion de organization_id: si el
-- pipeline de ingesta tuviera un bug, podria escribir un evento con el
-- endpoint de un tenant y el organization_id de otro, y la telemetria de un
-- cliente aparecería en el dashboard de otro. Ese es el fallo mas grave
-- imaginable en un producto multi-tenant de seguridad.
create or replace function public.assert_event_tenant_matches()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.endpoints e
     where e.id = new.endpoint_id
       and e.organization_id = new.organization_id
  ) then
    raise exception 'El endpoint % no pertenece a la organizacion %',
      new.endpoint_id, new.organization_id;
  end if;
  return new;
end;
$$;

create trigger activity_events_assert_tenant
  before insert on public.activity_events
  for each row execute function public.assert_event_tenant_matches();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Habilitado en la tabla padre: se hereda automaticamente en cada particion.
alter table public.activity_events enable row level security;

revoke all on public.activity_events from anon, authenticated;
grant select on public.activity_events to authenticated;

-- Telemetria es SOLO LECTURA para todo usuario humano, incluido el owner.
-- Es evidencia forense: si un admin pudiera editar o borrar eventos, un
-- empleado con acceso a la consola podria borrar el rastro de su propia fuga de
-- informacion y el producto entero perderia valor probatorio. La escritura
-- entra unicamente por el pipeline de ingesta con service_role, y la unica
-- eliminacion posible es la purga por retencion (drop de particion, que corre
-- como owner de la tabla).
create policy activity_events_select_same_org
  on public.activity_events
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()));

create policy activity_events_require_mfa
  on public.activity_events
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()));

-- =============================================================================
-- GESTION DE PARTICIONES
-- =============================================================================
-- Regla de oro: SIEMPRE debe existir la particion del mes en curso y de los
-- meses proximos. Un INSERT sin particion destino falla, y en esta tabla eso
-- significa perder telemetria de todos los clientes a la vez. Por eso
-- provision_activity_partitions() se adelanta varios meses y es idempotente.

create or replace function public.create_activity_events_partition(p_month date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'activity_events_' || to_char(v_start, 'YYYY_MM');
begin
  if to_regclass('public.' || v_name) is not null then
    return v_name;  -- ya existe: idempotente
  end if;

  execute format(
    'create table public.%I partition of public.activity_events for values from (%L) to (%L)',
    v_name, v_start, v_end
  );

  return v_name;
end;
$$;

create or replace function public.provision_activity_partitions(p_months_ahead integer default 3)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer;
begin
  -- Desde el mes anterior (por eventos que llegan tarde desde una cola offline
  -- que estuvo dias sin red) hasta p_months_ahead meses adelante.
  for i in -1 .. p_months_ahead loop
    return next public.create_activity_events_partition(
      (date_trunc('month', now()) + (i || ' month')::interval)::date
    );
  end loop;
end;
$$;

-- Particiones iniciales para que el sistema pueda ingerir desde el primer dia.
select public.provision_activity_partitions(3);

-- =============================================================================
-- AGREGADOS HISTORICOS
-- =============================================================================
-- Lo que sobrevive a la purga de 90 dias. Alimenta los reportes de uso por
-- categoria, por hora del dia y por dia de semana (Modulo 1).
create table public.activity_daily_rollups (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.endpoints(id) on delete cascade,
  day             date not null,
  event_type      public.event_type not null,

  event_count     integer not null default 0,

  -- 24 contadores, uno por hora local. Guardarlo asi (y no como 24 filas)
  -- mantiene la tabla pequeña y hace trivial el grafico de barras por hora.
  hourly_counts   integer[] not null default array_fill(0, array[24])
                    check (array_length(hourly_counts, 1) = 24),

  first_seen_at   timestamptz,
  last_seen_at    timestamptz,

  primary key (organization_id, endpoint_id, day, event_type)
);

create index activity_daily_rollups_org_day_idx
  on public.activity_daily_rollups (organization_id, day desc);

alter table public.activity_daily_rollups enable row level security;

revoke all on public.activity_daily_rollups from anon, authenticated;
grant select on public.activity_daily_rollups to authenticated;

create policy activity_daily_rollups_select_same_org
  on public.activity_daily_rollups
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()));

create policy activity_daily_rollups_require_mfa
  on public.activity_daily_rollups
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()));

-- Consolida un dia de telemetria cruda. Idempotente (upsert), de modo que
-- reprocesar un dia por un fallo del job no duplica conteos.
create or replace function public.rollup_activity_day(p_day date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  -- Una sola pasada sobre la particion del dia (hourly), y sobre ese resultado
  -- ya reducido se arma el pivote de 24 horas. Evita reconsultar la tabla
  -- grande una vez por grupo.
  with hourly as (
    select
      e.organization_id,
      e.endpoint_id,
      e.event_type,
      extract(hour from e.occurred_at)::integer as hr,
      count(*)::integer                          as c,
      min(e.occurred_at)                         as first_at,
      max(e.occurred_at)                         as last_at
    from public.activity_events e
    where e.occurred_at >= p_day
      and e.occurred_at <  p_day + 1
    group by 1, 2, 3, 4
  ),
  totals as (
    select
      h.organization_id,
      h.endpoint_id,
      h.event_type,
      sum(h.c)::integer as event_count,
      min(h.first_at)   as first_seen_at,
      max(h.last_at)    as last_seen_at
    from hourly h
    group by 1, 2, 3
  ),
  pivoted as (
    select
      t.organization_id,
      t.endpoint_id,
      t.event_type,
      array_agg(coalesce(h.c, 0) order by gs.hr) as hourly_counts
    from totals t
    cross join generate_series(0, 23) as gs(hr)
    left join hourly h
      on  h.organization_id = t.organization_id
      and h.endpoint_id     = t.endpoint_id
      and h.event_type      = t.event_type
      and h.hr              = gs.hr
    group by 1, 2, 3
  )
  insert into public.activity_daily_rollups (
    organization_id, endpoint_id, day, event_type,
    event_count, hourly_counts, first_seen_at, last_seen_at
  )
  select
    t.organization_id,
    t.endpoint_id,
    p_day,
    t.event_type,
    t.event_count,
    p.hourly_counts,
    t.first_seen_at,
    t.last_seen_at
  from totals t
  join pivoted p
    on  p.organization_id = t.organization_id
    and p.endpoint_id     = t.endpoint_id
    and p.event_type      = t.event_type
  on conflict (organization_id, endpoint_id, day, event_type) do update
    set event_count   = excluded.event_count,
        hourly_counts = excluded.hourly_counts,
        first_seen_at = excluded.first_seen_at,
        last_seen_at  = excluded.last_seen_at;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- =============================================================================
-- PURGA POR RETENCION
-- =============================================================================
-- Dropea particiones completamente fuera de la ventana de retencion.
--
-- SALVAGUARDA: se niega a purgar un mes que no este consolidado en rollups. Sin
-- esa comprobacion, un job mal configurado destruiria telemetria historica de
-- forma irreversible y silenciosa. Preferimos que la purga falle y alerte a que
-- borre datos que nadie puede recuperar.
create or replace function public.prune_activity_events(
  p_retention_days integer default 90,
  p_dry_run        boolean default false
)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff        date := (now() - (p_retention_days || ' days')::interval)::date;
  v_part          record;
  v_part_start    date;
  v_has_rollups   boolean;
begin
  if p_retention_days < 30 then
    raise exception 'La retencion minima es de 30 dias';
  end if;

  for v_part in
    select c.relname
      from pg_class c
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class p on p.oid = i.inhparent
     where p.relname = 'activity_events'
     order by c.relname
  loop
    v_part_start := to_date(right(v_part.relname, 7), 'YYYY_MM');

    -- Solo particiones cuyo mes COMPLETO quedo fuera de la ventana.
    continue when (v_part_start + interval '1 month')::date > v_cutoff;

    select exists (
      select 1 from public.activity_daily_rollups
       where day >= v_part_start
         and day <  (v_part_start + interval '1 month')::date
    ) into v_has_rollups;

    if not v_has_rollups then
      raise warning 'Particion % omitida: no tiene agregados en activity_daily_rollups', v_part.relname;
      continue;
    end if;

    if p_dry_run then
      return next format('DRY RUN: se dropearia %s', v_part.relname);
    else
      execute format('drop table public.%I', v_part.relname);
      return next format('dropeada %s', v_part.relname);
    end if;
  end loop;
end;
$$;

revoke execute on function public.create_activity_events_partition(date) from public, anon, authenticated;
revoke execute on function public.provision_activity_partitions(integer)  from public, anon, authenticated;
revoke execute on function public.rollup_activity_day(date)               from public, anon, authenticated;
revoke execute on function public.prune_activity_events(integer, boolean) from public, anon, authenticated;

grant execute on function public.create_activity_events_partition(date) to service_role;
grant execute on function public.provision_activity_partitions(integer)  to service_role;
grant execute on function public.rollup_activity_day(date)               to service_role;
grant execute on function public.prune_activity_events(integer, boolean) to service_role;
