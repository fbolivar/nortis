-- Alertas de exposicion y persistencia: agent_report_inventory compara la foto
-- de puertos, recursos compartidos y autoarranque con la anterior y abre
-- incidentes ante entradas nuevas. Solo con foto previa.
--
-- El cuerpo completo de agent_report_inventory se aplico via migracion gestionada
-- (incluye las detecciones de red y de cuentas previas). Este archivo documenta
-- el helper y las reglas nuevas:
--   persistence.autoarranque_nuevo (alta, canal 'accounts')
--   exposure.recurso_compartido_nuevo (media, canal 'network')
--   exposure.puerto_nuevo (media, canal 'network'; excluye efimeros >= 49152)

create or replace function public.jsonb_as_array(j jsonb) returns jsonb
language sql immutable as $$
  select case
    when j is null then '[]'::jsonb
    when jsonb_typeof(j) = 'array' then j
    else jsonb_build_array(j)
  end;
$$;

-- NOTA: agent_report_inventory se recrea en la migracion gestionada
-- 'alertas_exposicion_persistencia' con los bloques de deteccion de exposicion y
-- persistencia añadidos sobre la version de vigilancia de cuentas.
