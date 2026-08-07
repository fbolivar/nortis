-- =============================================================================
-- Nortis | 11 - Trabajos programados (particiones, rollups, retencion)
-- =============================================================================
-- Todo el archivo esta guardado con comprobaciones de existencia de pg_cron.
-- En un proyecto Supabase nuevo la extension puede no estar habilitada todavia
-- (se activa en Dashboard > Database > Extensions), y una migracion que falle
-- por eso bloquearia el despliegue completo del esquema. Aqui se prefiere
-- avisar y continuar: el esquema queda correcto y los jobs se pueden programar
-- despues re-ejecutando `select public.schedule_nortis_jobs();`.
-- =============================================================================

create or replace function public.schedule_nortis_jobs()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning
      'pg_cron no esta habilitado: los jobs de particionado, rollup y retencion NO quedaron programados. Habilitelo en Dashboard > Database > Extensions y ejecute select public.schedule_nortis_jobs();';
    return 'skipped';
  end if;

  -- Idempotente: desprograma antes de programar, para poder re-ejecutar la
  -- funcion tras un cambio de horario sin acumular jobs duplicados.
  perform cron.unschedule(jobname)
     from cron.job
    where jobname in ('nortis-provision-partitions', 'nortis-rollup-daily', 'nortis-prune-events');

  -- 1) Particiones futuras. Diario, 03:00 UTC.
  --    Corre TODOS los dias y no una vez al mes a proposito: si el job falla un
  --    dia, al siguiente se recupera solo. Un fallo silencioso aqui significa
  --    perder telemetria de todos los tenants el dia 1 del mes siguiente.
  perform cron.schedule(
    'nortis-provision-partitions', '0 3 * * *',
    $job$ select public.provision_activity_partitions(3); $job$
  );

  -- 2) Consolidacion del dia anterior. Diario, 03:30 UTC.
  perform cron.schedule(
    'nortis-rollup-daily', '30 3 * * *',
    $job$ select public.rollup_activity_day((now() - interval '1 day')::date); $job$
  );

  -- 3) Purga por retencion. Semanal, domingo 04:00 UTC.
  --    Va DESPUES del rollup y solo semanal: la funcion ya se niega a dropear
  --    particiones sin agregados, y espaciarla deja margen para detectar un
  --    rollup roto antes de que haya nada irreversible.
  perform cron.schedule(
    'nortis-prune-events', '0 4 * * 0',
    $job$ select public.prune_activity_events(90); $job$
  );

  return 'scheduled';
end;
$$;

revoke execute on function public.schedule_nortis_jobs() from public, anon, authenticated;
grant execute on function public.schedule_nortis_jobs() to service_role;

select public.schedule_nortis_jobs();
