-- =============================================================================
-- Nortis | 20 - Programacion del motor de deteccion
-- =============================================================================
-- Ventana de 1 dia, cada 10 minutos.
--
-- Por que 1 dia y no mas: el grano de un incidente es (equipo, regla, dia), asi
-- que una ventana mayor solo sirve para rellenar historico. En operacion normal,
-- reevaluar el dia en curso cada 10 minutos mantiene el conteo al dia y produce
-- del orden de quince incidentes diarios en un parque de seis equipos — una cola
-- que un analista puede efectivamente revisar.
--
-- Por que NO en tiempo real dentro de la ingesta: la deteccion recorre la
-- telemetria del dia y agrupa. Hacerlo en el camino critico de cada lote del
-- agente convertiria una escritura barata en una consulta pesada, y un pico de
-- sincronizacion (cien equipos encendiendose a las 8am) tumbaria la ingesta
-- entera. Desacoplado, un retraso de diez minutos en abrir el incidente no
-- cambia nada: el evento ya quedo registrado y es inmutable.
create or replace function public.schedule_nortis_jobs()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning
      'pg_cron no esta habilitado: los jobs NO quedaron programados. Habilitelo en Dashboard > Database > Extensions y ejecute select public.schedule_nortis_jobs();';
    return 'skipped';
  end if;

  perform cron.unschedule(jobname)
     from cron.job
    where jobname in ('nortis-provision-partitions', 'nortis-rollup-daily',
                      'nortis-prune-events', 'nortis-detect-dlp');

  perform cron.schedule('nortis-provision-partitions', '0 3 * * *',
    $job$ select public.provision_activity_partitions(3); $job$);

  perform cron.schedule('nortis-rollup-daily', '30 3 * * *',
    $job$ select public.rollup_activity_day((now() - interval '1 day')::date); $job$);

  perform cron.schedule('nortis-prune-events', '0 4 * * 0',
    $job$ select public.prune_activity_events(90); $job$);

  perform cron.schedule('nortis-detect-dlp', '*/10 * * * *',
    $job$ select public.detect_dlp_incidents(1); $job$);

  return 'scheduled';
end;
$$;

revoke execute on function public.schedule_nortis_jobs() from public, anon, authenticated;
grant   execute on function public.schedule_nortis_jobs() to service_role;

select public.schedule_nortis_jobs();
