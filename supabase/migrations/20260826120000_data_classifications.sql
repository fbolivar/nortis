-- =============================================================================
-- Nortis | Clasificacion de datos (Fase A: por patron)
-- =============================================================================
-- Etiqueta los datos por REGLAS de metadato —extension del archivo y palabras
-- clave en la ruta— sin mirar el contenido. Es la base de "datos por
-- clasificacion": una vez que Nortis sabe que un archivo es "Codigo fuente" o
-- "Financiero", el panel puede agrupar las operaciones por esa etiqueta.
--
-- La Fase B (por CONTENIDO: regex de tarjetas, cedulas, etc. que el agente
-- inspecciona) se apoyara en esta misma tabla, anadiendo reglas de contenido.

create table public.data_classifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  -- Color de la etiqueta en las graficas (uno de los tonos de grafica del tema).
  color           text not null default '#0284c7',
  -- Reglas de metadato. Una ruta clasifica con la PRIMERA regla que casa: por
  -- extension (`.py`) o por palabra clave contenida en la ruta (`contabilidad`).
  extensions      text[] not null default '{}',
  path_keywords   text[] not null default '{}',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create unique index data_classifications_org_name_uniq
  on public.data_classifications (organization_id, lower(name));

alter table public.data_classifications enable row level security;

drop policy if exists "data_classifications_read" on public.data_classifications;
create policy "data_classifications_read" on public.data_classifications
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

drop policy if exists "data_classifications_write" on public.data_classifications;
create policy "data_classifications_write" on public.data_classifications
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and public.is_org_admin())
  with check (organization_id = (select public.current_org_id()) and public.is_org_admin());

-- Sembrar un juego de clasificaciones de arranque en cada organizacion que ya
-- exista. Una organizacion nueva las puede crear a mano; esto solo evita empezar
-- con la pantalla en blanco a quienes ya usan Nortis.
insert into public.data_classifications (organization_id, name, color, extensions, path_keywords, sort_order)
select o.id, d.name, d.color, d.extensions, d.path_keywords, d.sort_order
from public.organizations o
cross join (values
  ('Codigo fuente',   '#0284c7', array['.c','.cpp','.h','.py','.js','.ts','.go','.java','.rb','.php','.sql','.sh','.cs'], array['\\src\\','\\repos\\']::text[], 1),
  ('Financiero',      '#c2410c', array['.xls','.xlsx','.csv']::text[], array['contabilidad','nomina','factura','finanzas','presupuesto'], 2),
  ('Datos personales','#be185d', array[]::text[], array['cedula','rrhh','empleados','hojas de vida','personal'], 3),
  ('Documentos',      '#075985', array['.doc','.docx','.pdf','.odt','.rtf']::text[], array[]::text[], 4),
  ('Diseno / CAD',    '#047857', array['.dwg','.psd','.ai','.dxf']::text[], array[]::text[], 5)
) as d(name, color, extensions, path_keywords, sort_order)
on conflict do nothing;
