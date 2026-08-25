-- =============================================================================
-- Nortis | Reporte de dispositivos externos conectados (panel principal)
-- =============================================================================
-- Devuelve, para cada dispositivo USB visto en la ventana, su ultimo estado:
-- serial (la clave de las listas blancas), identificadores de fabricante y
-- producto, etiqueta, capacidad, la accion que tomo el agente y cuando se vio.
--
-- distinct on por dispositivo: un mismo USB conectado diez veces es UNA fila con
-- su ultima conexion, no diez. La clave es el serial; si el agente no lo pudo
-- leer, cae al id del evento para no colapsar dispositivos distintos en uno.
--
-- SECURITY INVOKER: se apoya en el RLS de activity_events, de modo que cada
-- usuario ve solo los dispositivos de su organizacion.
create or replace function public.report_connected_usb(p_days integer default 30)
returns table (
  serial         text,
  label          text,
  vendor_id      text,
  product_id     text,
  capacity_bytes bigint,
  enforcement    text,
  veces          bigint,
  last_seen      timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $$
  select distinct on (e.clave)
    e.payload ->> 'serial'                            as serial,
    e.payload ->> 'label'                             as label,
    e.payload ->> 'vendor_id'                         as vendor_id,
    e.payload ->> 'product_id'                        as product_id,
    nullif(e.payload ->> 'capacity_bytes', '')::bigint as capacity_bytes,
    e.payload ->> 'enforcement'                       as enforcement,
    count(*)  over (partition by e.clave)             as veces,
    max(e.occurred_at) over (partition by e.clave)    as last_seen
  from (
    select *,
           coalesce(nullif(payload ->> 'serial', ''), id::text) as clave
      from public.activity_events
     where event_type = 'usb_connected'
       and occurred_at >= (now() - make_interval(days => p_days))
  ) e
  order by e.clave, e.occurred_at desc;
$$;

revoke execute on function public.report_connected_usb(integer) from public, anon;
grant   execute on function public.report_connected_usb(integer) to authenticated;
