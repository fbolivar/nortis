-- =============================================================================
-- Nortis | 08 - dlp_incidents (eventos que violan politica)
-- =============================================================================

create table public.dlp_incidents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.endpoints(id) on delete cascade,

  -- ---------------------------------------------------------------------------
  -- Referencia al evento origen: SIN foreign key, a proposito.
  -- ---------------------------------------------------------------------------
  -- activity_events es particionada y su PK es compuesta (id, occurred_at), asi
  -- que una FK real exigiria ambas columnas. Peor: esa FK haria que
  -- `drop table` de una particion vencida fallara mientras exista un incidente
  -- que la referencie, y la purga por retencion quedaria bloqueada para siempre.
  --
  -- Se resuelve al reves: el incidente guarda una FOTO del evento en
  -- event_snapshot. A los 91 dias el evento crudo desaparece, pero el incidente
  -- —que es lo que tiene valor probatorio y puede seguir abierto— conserva
  -- integra la evidencia que lo motivo.
  event_id            uuid,
  event_occurred_at   timestamptz,
  event_snapshot      jsonb not null default '{}'::jsonb,

  rule_triggered      text not null,
  rule_channel        text,   -- usb | clipboard | print | web | email | storage
  severity            public.incident_severity not null default 'medium',

  status              public.incident_status not null default 'open',

  -- Accion que el agente efectivamente tomo (blocked / allowed / alerted).
  -- Distinguir "lo bloquee" de "lo vi pasar" es la diferencia entre prevencion y
  -- registro, y el analista necesita saber cual fue.
  enforcement_action  text,

  reviewed_by         uuid references public.users(id) on delete set null,
  reviewed_at         timestamptz,
  review_notes        text,

  detected_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint dlp_incidents_snapshot_is_object check (jsonb_typeof(event_snapshot) = 'object'),

  -- Un incidente resuelto sin constancia de quien lo resolvio no sirve para una
  -- auditoria ISO 27001. El invariante se enforza aqui, no en la UI.
  constraint dlp_incidents_review_is_attributable check (
    status = 'open'
    or (reviewed_by is not null and reviewed_at is not null)
  )
);

create index dlp_incidents_org_status_idx
  on public.dlp_incidents (organization_id, status, severity desc, detected_at desc);
create index dlp_incidents_endpoint_idx on public.dlp_incidents (endpoint_id, detected_at desc);
create index dlp_incidents_open_idx
  on public.dlp_incidents (organization_id, detected_at desc)
  where status = 'open';

create trigger dlp_incidents_set_updated_at
  before update on public.dlp_incidents
  for each row execute function public.set_updated_at();

-- Sella automaticamente quien y cuando reviso, en lugar de confiar en que el
-- cliente mande esos campos. Ademas impide reabrir un incidente cerrado sin
-- dejar rastro (vuelve a exigir atribucion).
create or replace function public.stamp_incident_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'open' then
    new.reviewed_by := coalesce((select auth.uid()), new.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger dlp_incidents_stamp_review
  before update on public.dlp_incidents
  for each row execute function public.stamp_incident_review();

-- Mismo blindaje de coherencia de tenant que en activity_events.
create or replace function public.assert_incident_tenant_matches()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.endpoints e
     where e.id = new.endpoint_id
       and e.organization_id = new.organization_id
  ) then
    raise exception 'El endpoint % no pertenece a la organizacion %',
      new.endpoint_id, new.organization_id;
  end if;
  return new;
end;
$$;

create trigger dlp_incidents_assert_tenant
  before insert or update on public.dlp_incidents
  for each row execute function public.assert_incident_tenant_matches();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.dlp_incidents enable row level security;

revoke all on public.dlp_incidents from anon, authenticated;
grant select on public.dlp_incidents to authenticated;

-- Solo se pueden tocar los campos del flujo de revision. El hecho detectado
-- (regla, severidad, evidencia) es inmutable para el usuario: si un admin
-- pudiera reescribir `rule_triggered` o `event_snapshot`, el incidente dejaria
-- de ser evidencia y pasaria a ser opinion.
grant update (status, review_notes, reviewed_by, reviewed_at) on public.dlp_incidents to authenticated;

-- Sin INSERT ni DELETE para authenticated: los incidentes los crea el pipeline
-- de ingesta (service_role) al evaluar la telemetria contra las reglas.

create policy dlp_incidents_select_same_org
  on public.dlp_incidents
  for select
  to authenticated
  using (organization_id = (select public.current_org_id()));

-- Revisar incidentes es trabajo de analista: owner/admin. El viewer los ve pero
-- no cambia su estado.
create policy dlp_incidents_review_admin
  on public.dlp_incidents
  for update
  to authenticated
  using  (organization_id = (select public.current_org_id()) and (select public.is_org_admin()))
  with check (organization_id = (select public.current_org_id()) and (select public.is_org_admin()));

create policy dlp_incidents_require_mfa
  on public.dlp_incidents
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_satisfied()))
  with check ((select public.mfa_satisfied()));
