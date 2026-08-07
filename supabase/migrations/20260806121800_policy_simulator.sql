-- =============================================================================
-- Nortis | 18 - Simulador de politica (Modulo 2)
-- =============================================================================
-- Responde "¿que pasaria si aplico este perfil?" evaluando la politica contra la
-- telemetria YA REGISTRADA de los equipos seleccionados.
--
-- Por que importa: el riesgo real de una consola de DLP no es que bloquee poco,
-- es que bloquee de mas. Un perfil que corta 400 guardados legitimos al dia hace
-- que el cliente desinstale el agente en una semana. Con el simulador el
-- administrador ve el impacto ANTES de desplegar, sobre el trabajo real de su
-- propia gente y no sobre supuestos.
--
-- SECURITY INVOKER: RLS acota los eventos a la organizacion de quien llama, asi
-- que la funcion no puede simular sobre datos de otro tenant ni por error.
--
-- LIMITACION QUE LA INTERFAZ DEBE DECLARAR: se evalua sobre historial, que es
-- una aproximacion honesta pero no exacta. La telemetria registra lo que ocurrio
-- bajo la politica ANTERIOR; si la nueva bloquea algo, el usuario habria
-- intentado otra cosa. El numero es una COTA SUPERIOR del impacto.
create or replace function public.simulate_policy(
  p_config    jsonb,
  p_endpoints uuid[] default null,
  p_days      integer default 14
)
returns table (
  rule_key           text,
  channel            text,
  action             text,
  affected_events    bigint,
  affected_endpoints bigint,
  sample             text
)
language sql
security invoker
stable
set search_path = ''
as $$
with scope as (
  select e.id, e.endpoint_id, e.event_type, e.payload
    from public.activity_events e
   where e.occurred_at >= (now() - make_interval(days => p_days))
     and (p_endpoints is null or e.endpoint_id = any(p_endpoints))
),
cfg as (
  select
    coalesce(p_config #> '{storage,allowed_paths}',      '[]'::jsonb) as allowed_paths,
    coalesce(p_config #> '{storage,blocked_extensions}', '[]'::jsonb) as blocked_ext,
    coalesce(p_config #>> '{usb,mode}',       'allow')                as usb_mode,
    coalesce(p_config #> '{usb,serial_allowlist}',       '[]'::jsonb) as usb_allow,
    coalesce(p_config #> '{web,blocked_domains}',        '[]'::jsonb) as blocked_domains,
    coalesce(p_config #> '{web,allowed_domains}',        '[]'::jsonb) as allowed_domains,
    coalesce((p_config #>> '{web,block_webmail}')::boolean, false)    as block_webmail,
    coalesce(p_config #>> '{clipboard,mode}', 'allow')                as clip_mode,
    coalesce(p_config #> '{clipboard,protected_sources}','[]'::jsonb) as clip_sources,
    coalesce(p_config #>> '{printing,mode}',  'allow')                as print_mode
)

-- 1. Guardado fuera de carpeta autorizada
select
  'storage.carpeta_no_autorizada', 'storage', 'block',
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(s.payload ->> 'path')
from scope s, cfg
where jsonb_array_length(cfg.allowed_paths) > 0
  and s.event_type in ('file_created', 'file_modified')
  and s.payload ->> 'path' is not null
  and not exists (
    select 1 from jsonb_array_elements_text(cfg.allowed_paths) as ap(path)
     where s.payload ->> 'path' like ap.path || '%'
  )
having count(*) > 0

union all

-- 2. Extension prohibida
select
  'storage.extension_prohibida', 'storage', 'block',
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(s.payload ->> 'path')
from scope s, cfg
where jsonb_array_length(cfg.blocked_ext) > 0
  and s.event_type in ('file_created', 'file_modified')
  and lower(coalesce(s.payload ->> 'extension', '')) in (
    select lower(value) from jsonb_array_elements_text(cfg.blocked_ext)
  )
having count(*) > 0

union all

-- 3. USB no autorizado
select
  'usb.dispositivo_no_autorizado', 'usb',
  (select cfg.usb_mode from cfg),
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(coalesce(s.payload ->> 'serial', s.payload ->> 'label'))
from scope s, cfg
where cfg.usb_mode <> 'allow'
  and s.event_type = 'usb_connected'
  and coalesce(s.payload ->> 'serial', '') not in (
    select value from jsonb_array_elements_text(cfg.usb_allow)
  )
having count(*) > 0

union all

-- 4. Dominio bloqueado explicitamente
select
  'web.dominio_bloqueado', 'web', 'block',
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(s.payload ->> 'domain')
from scope s, cfg
where jsonb_array_length(cfg.blocked_domains) > 0
  and s.event_type = 'web_visit'
  and exists (
    select 1 from jsonb_array_elements_text(cfg.blocked_domains) as bd(domain)
     where s.payload ->> 'domain' = bd.domain
        or s.payload ->> 'domain' like '%.' || bd.domain
  )
having count(*) > 0

union all

-- 5. Lista blanca de dominios: TODO lo que no este en ella queda fuera.
--    Es la regla que mas falsos positivos genera, por eso se reporta aparte y
--    no mezclada con los bloqueos explicitos.
select
  'web.fuera_de_lista_blanca', 'web', 'block',
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(s.payload ->> 'domain')
from scope s, cfg
where jsonb_array_length(cfg.allowed_domains) > 0
  and s.event_type = 'web_visit'
  and not exists (
    select 1 from jsonb_array_elements_text(cfg.allowed_domains) as ad(domain)
     where s.payload ->> 'domain' = ad.domain
        or s.payload ->> 'domain' like '%.' || ad.domain
  )
having count(*) > 0

union all

-- 6. Webmail
select
  'web.webmail_bloqueado', 'web', 'block',
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(s.payload ->> 'domain')
from scope s, cfg
where cfg.block_webmail
  and s.event_type = 'web_visit'
  and s.payload ->> 'domain' in (
    'mail.google.com','gmail.com','outlook.com','outlook.live.com','hotmail.com',
    'mail.yahoo.com','proton.me','mail.proton.me','zoho.com','mail.com'
  )
having count(*) > 0

union all

-- 7. Portapapeles
select
  'clipboard.copia_desde_origen_protegido', 'clipboard',
  (select case when cfg.clip_mode = 'block' then 'block' else 'alert' end from cfg),
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(s.payload ->> 'source_app')
from scope s, cfg
where cfg.clip_mode <> 'allow'
  and s.event_type = 'clipboard_copy'
  and (
    jsonb_array_length(cfg.clip_sources) = 0
    or s.payload ->> 'source_app' in (select value from jsonb_array_elements_text(cfg.clip_sources))
  )
having count(*) > 0

union all

-- 8. Impresion
select
  'print.trabajo_intervenido', 'print',
  (select case when cfg.print_mode = 'block' then 'block' else 'log' end from cfg),
  count(*)::bigint, count(distinct s.endpoint_id)::bigint,
  min(s.payload ->> 'document')
from scope s, cfg
where cfg.print_mode <> 'allow'
  and s.event_type = 'print_job'
having count(*) > 0

order by 4 desc;
$$;

revoke execute on function public.simulate_policy(jsonb, uuid[], integer) from public, anon;
grant   execute on function public.simulate_policy(jsonb, uuid[], integer) to authenticated;
