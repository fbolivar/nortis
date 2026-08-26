-- =============================================================================
-- Nortis | Alertas por correo (1/2): ajustes por tenant + marca de notificado
-- =============================================================================
-- Preferencias de alerta POR ORGANIZACION: a que correos avisar, desde que
-- severidad, y si estan activas. El envio (2/2) lo hace un job SQL con pg_net.
--
-- Se respeta el modelo de Nortis: nada de service_role. La UI lee via RLS y
-- escribe via un RPC SECURITY DEFINER que exige admin del tenant.

-- Marca de "ya se aviso" en el incidente: null = pendiente de notificar.
alter table public.dlp_incidents
  add column if not exists notified_at timestamptz;

create table if not exists public.alert_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled         boolean not null default false,
  recipients      text[]  not null default '{}',
  min_severity    public.incident_severity not null default 'high',
  updated_at      timestamptz not null default now()
);

alter table public.alert_settings enable row level security;

-- Lectura: cualquier miembro del tenant ve los ajustes de SU organizacion.
drop policy if exists alert_settings_select on public.alert_settings;
create policy alert_settings_select on public.alert_settings
  for select using (organization_id = (select public.current_org_id()));

-- La escritura NO se hace por politica sino por el RPC de abajo (admin). Sin
-- politica de insert/update, un cliente no puede tocar la tabla directamente.

-- Upsert de ajustes. Solo admin del tenant. Valida los correos y acota la lista.
create or replace function public.set_alert_settings(
  p_enabled boolean,
  p_recipients text[],
  p_min_severity public.incident_severity
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid := (select public.current_org_id());
        v_clean text[];
        v_mail text;
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'solo un administrador puede cambiar las alertas';
  end if;

  -- Normaliza y valida: minusculas, sin vacios, formato de correo, max 20.
  v_clean := array(
    select distinct lower(trim(x))
    from unnest(coalesce(p_recipients, '{}')) as x
    where trim(x) <> ''
  );
  if array_length(v_clean, 1) > 20 then
    raise exception 'demasiados destinatarios (maximo 20)';
  end if;
  foreach v_mail in array v_clean loop
    if v_mail !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
      raise exception 'correo no valido: %', v_mail;
    end if;
  end loop;

  insert into public.alert_settings as s (organization_id, enabled, recipients, min_severity, updated_at)
  values (v_org, coalesce(p_enabled, false), v_clean, coalesce(p_min_severity, 'high'), now())
  on conflict (organization_id) do update
    set enabled = excluded.enabled,
        recipients = excluded.recipients,
        min_severity = excluded.min_severity,
        updated_at = now();
end;
$$;

revoke execute on function public.set_alert_settings(boolean, text[], public.incident_severity) from public, anon;
grant   execute on function public.set_alert_settings(boolean, text[], public.incident_severity) to authenticated;
