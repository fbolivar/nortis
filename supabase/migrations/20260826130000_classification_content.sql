-- =============================================================================
-- Nortis | Clasificacion de datos (Fase B: por contenido)
-- =============================================================================
-- La Fase A etiqueta por metadato (extension, ruta). Esta anade reglas de
-- CONTENIDO: expresiones regulares que el agente evalua LOCALMENTE sobre el
-- contenido del archivo. El agente envia solo la ETIQUETA resultante, nunca el
-- contenido — el mismo principio que rige toda la telemetria de Nortis.
--
-- Los patrones se evaluan con el motor RE2 de Go (sin backtracking catastrofico),
-- asi que una regla mal escrita no puede colgar al agente (no hay ReDoS).

alter table public.data_classifications
  add column if not exists content_patterns text[] not null default '{}';

-- Sembrar patrones de contenido en los defaults ya existentes de cada
-- organizacion. Solo se tocan las clasificaciones sembradas que aun no tengan
-- patrones, para no pisar reglas que el cliente haya ajustado.
update public.data_classifications
   set content_patterns = array[
     -- Numero de tarjeta (16 digitos, con o sin separadores). \b evita pescar
     -- numeros mas largos.
     '\b(?:\d[ -]?){13,16}\b'
   ]
 where lower(name) = 'financiero' and coalesce(array_length(content_patterns, 1), 0) = 0;

update public.data_classifications
   set content_patterns = array[
     -- Cedula colombiana (7-10 digitos) precedida de la palabra, y NIT.
     '(?i)c[eé]dula[^0-9]{0,10}\d{6,10}',
     '(?i)\bnit\b[^0-9]{0,10}\d{9,10}'
   ]
 where lower(name) = 'datos personales' and coalesce(array_length(content_patterns, 1), 0) = 0;
