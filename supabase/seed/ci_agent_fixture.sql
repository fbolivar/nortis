-- =============================================================================
-- Nortis | Fixture del contrato del agente (SOLO integracion continua)
-- =============================================================================
-- Tenant minimo para que la suite HTTP de tests/agent-api.test.mjs pueda
-- ejercitar /api/agent de punta a punta: una organizacion, un perfil de
-- seguridad por defecto y una credencial de organizacion conocida.
--
-- ================== SOBRE LA CREDENCIAL QUE APARECE ABAJO ====================
--
-- Si esta leyendo esto en el repositorio publico y le ha saltado la alarma al
-- ver algo con pinta de clave: bien. Lea el parrafo entero antes de seguir.
--
-- `nrt_live_c1c1…c1` NO es una credencial de ningun sistema real. Es una cadena
-- fija —"c1" repetido treinta y dos veces, escogida para que se reconozca de un
-- vistazo como artificial— que solo existe dentro de la base de datos efimera
-- que `supabase start` levanta en el contenedor de CI y que se destruye al
-- terminar el trabajo. Nunca ha sido valida contra el proyecto de produccion y
-- no puede serlo: `api_keys` guarda el HASH, y este INSERT solo mete el hash de
-- esta cadena en ESTA base local.
--
-- Es deliberado que sea determinista y este versionada. La alternativa —generar
-- la clave en el propio trabajo de CI y pasarla por variable— añadiria un paso
-- fragil y un secreto que gestionar, para proteger algo que no tiene valor.
--
-- LA REGLA QUE SI IMPORTA, y que este archivo no rompe: CI no maneja ningun
-- secreto real. Corre contra un Supabase local, no contra el proyecto de
-- produccion. Si algun dia alguien apunta este fixture a una base real, el
-- problema sera esa decision, no esta cadena.
-- =============================================================================

do $$
declare
  -- Debe coincidir con la constante del workflow (.github/workflows/ci.yml).
  -- Si divergen, la suite falla en el primer enrolamiento con un 401 que no
  -- explica nada; por eso el workflow la declara UNA vez y la pasa por argumento.
  c_api_key constant text := 'nrt_live_' || repeat('c1', 32);

  -- UUID fijos y reconocibles (c1c1…), para que en una consulta manual sobre la
  -- base local se distingan al instante de datos de verdad.
  v_org  uuid := 'c1c1c1c1-0000-4000-8000-000000000001'::uuid;
  v_prof uuid := 'c1c1c1c1-0000-4000-8000-000000000002'::uuid;
begin
  insert into public.organizations (id, name, slug)
  values (v_org, 'Tenant de integracion continua', 'ci-nortis')
  on conflict (id) do nothing;

  -- `is_default` es imprescindible: agent_enroll asigna el perfil por defecto al
  -- equipo recien dado de alta, y la suite comprueba justamente que lo haga.
  -- Sin esta fila el enrolamiento funciona pero devuelve profile_id nulo, y el
  -- fallo se manifiesta tres pruebas mas adelante, en /policy.
  insert into public.security_profiles (id, organization_id, name, description, is_default, config)
  values (
    v_prof, v_org, 'Perfil de integracion continua',
    'Politica en blanco: la suite verifica el transporte, no el enforcement.',
    true, '{}'::jsonb
  )
  on conflict (id) do nothing;

  -- El hash se calcula aqui y no se escribe a mano: dejar el digest literal en
  -- el archivo obliga a recalcularlo a mano si la cadena cambia, y un hash que
  -- no corresponde produce el mismo 401 mudo.
  insert into public.api_keys (organization_id, name, key_hash, key_prefix)
  values (
    v_org, 'Credencial de integracion continua',
    encode(extensions.digest(c_api_key, 'sha256'), 'hex'),
    left(c_api_key, 16)
  )
  on conflict do nothing;

  -- La organizacion se queda SIN consentimiento de monitoreo firmado a
  -- proposito: la suite comprueba que /policy recorte los modulos invasivos y
  -- devuelva monitoring_allowed = false. Firmarlo aqui haria pasar esas dos
  -- pruebas por el motivo equivocado.
end $$;
