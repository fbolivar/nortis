-- =============================================================================
-- Nortis | Nuevas clases (Salud, Legal/Contratos) + pasaporte y RUT
-- =============================================================================
-- Amplia la cobertura de clasificacion. Patrones validados con el motor RE2 de
-- Go (el del agente): casan ejemplos reales y no disparan con textos parecidos
-- ("historia del arte", "el contrato es importante", "diagnostico economico").
-- El agente evalua las reglas localmente y reporta solo la etiqueta.

-- Dos clases nuevas, sembradas en cada organizacion existente. sort_order se
-- calcula al final de la lista de cada org para no colisionar con lo que ya haya.
-- Salud es SENSIBLE (escala la severidad de sus incidentes); Legal no.
insert into public.data_classifications
  (organization_id, name, color, extensions, path_keywords, content_patterns, sensitive, sort_order)
select o.id, d.name, d.color, d.extensions, d.path_keywords, d.content_patterns, d.sensitive,
       (select coalesce(max(x.sort_order), 0) from public.data_classifications x
         where x.organization_id = o.id) + d.rn
from public.organizations o
cross join (values
  ('Salud', '#0891b2',
    array[]::text[],
    array['salud','clinica','historia clinica','eps','medico'],
    array[
      '(?i)historia\s+cl[ií]nica',
      '(?i)epicrisis',
      '(?i)f[oó]rmula\s+m[eé]dica',
      '(?i)diagn[oó]stico\s+m[eé]dico'
    ], true, 1),
  ('Legal / Contratos', '#7c3aed',
    array['.doc','.docx','.pdf']::text[],
    array['contrato','contratos','legal','juridico'],
    array[
      '(?i)cl[aá]usula\s+(?:primera|segunda|tercera|cuarta|quinta|d[eé]cima|\d)',
      '(?i)entre\s+las\s+partes',
      '(?i)contrato\s+de\s+(?:trabajo|prestaci[oó]n|arrendamiento|compraventa|servicios)'
    ], false, 2)
) as d(name, color, extensions, path_keywords, content_patterns, sensitive, rn)
on conflict do nothing;

-- Pasaporte y RUT se suman a "Datos personales" (sin duplicar si ya estuvieran).
update public.data_classifications
   set content_patterns = content_patterns || array[
     '(?i)pasaporte[^0-9A-Za-z]{0,10}[A-Z]{0,2}\d{6,9}',
     '(?i)registro\s+[uú]nico\s+tributario'
   ]
 where lower(name) = 'datos personales'
   and not ('(?i)registro\s+[uú]nico\s+tributario' = any(content_patterns));
