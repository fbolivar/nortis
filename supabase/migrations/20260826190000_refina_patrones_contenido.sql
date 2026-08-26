-- =============================================================================
-- Nortis | Afinar patrones de contenido (Datos personales y Financiero)
-- =============================================================================
-- Amplia la cobertura de la clasificacion por CONTENIDO (Fase B) para el caso
-- colombiano: cedula con la abreviatura "C.C.", cedulas y NIT con puntos de
-- miles, correos y telefonos moviles; y en Financiero, tarjetas mas precisas y
-- numeros de cuenta. Todos los patrones se validaron con el motor RE2 de Go (el
-- que corre el agente): casan los ejemplos reales y no disparan con fechas,
-- totales cortos ni horas.
--
-- SOLO se tocan las filas que aun conservan EXACTAMENTE el patron sembrado por
-- defecto. Si un cliente ya ajusto sus reglas, no se pisan.

-- Datos personales -----------------------------------------------------------
update public.data_classifications
   set content_patterns = array[
     -- Cedula precedida de la palabra (admite puntos de miles: 79.123.456).
     '(?i)c[eé]dula[^0-9]{0,12}\d[\d.]{5,12}',
     -- Abreviatura "C.C." / "CC No." muy comun en documentos colombianos.
     '(?i)\bc\.?\s?c\.?\s?(?:n[oº°.]{0,3}\s?)?\d[\d.]{5,12}',
     -- NIT (9-10 digitos, con o sin puntos).
     '(?i)\bnit\b[^0-9]{0,12}\d[\d.]{8,13}',
     -- Correo electronico (dato de contacto personal).
     '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
     -- Movil colombiano precedido de la palabra (evita pescar cualquier numero).
     '(?i)(?:tel[eé]fono|celular|m[oó]vil|\bcel\b)[^0-9]{0,10}(?:\+?57\s?)?3\d{9}'
   ]
 where lower(name) = 'datos personales'
   and content_patterns = array[
     '(?i)c[eé]dula[^0-9]{0,10}\d{6,10}',
     '(?i)\bnit\b[^0-9]{0,10}\d{9,10}'
   ]::text[];

-- Financiero -----------------------------------------------------------------
update public.data_classifications
   set content_patterns = array[
     -- Numero de tarjeta: 13-16 digitos con o sin separadores, empieza y termina
     -- en digito (mas preciso que la version anterior).
     '\b\d(?:[ -]?\d){12,15}\b',
     -- Numero de cuenta precedido de la palabra (8-20 digitos).
     '(?i)(?:cuenta|cta\.?)[^0-9]{0,20}\d{8,20}'
   ]
 where lower(name) = 'financiero'
   and content_patterns = array['\b(?:\d[ -]?){13,16}\b']::text[];
