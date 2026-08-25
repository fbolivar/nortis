-- =============================================================================
-- Nortis | Bucket de distribucion del agente (instalador)
-- =============================================================================
-- Guarda los artefactos que la consola empaqueta para que un cliente descargue
-- e instale el agente: el MSI compilado y firmado por el pipeline, y la clave
-- PUBLICA de la consola (console_pubkey.pem), que es el ancla de confianza de la
-- proteccion anti-manipulacion del agente.
--
-- A DIFERENCIA de encrypted-documents, aqui NO hay frontera por tenant: el MSI y
-- la clave publica son identicos para todos los clientes. Lo que es por-tenant
-- —la credencial de enrolamiento— NO se guarda aqui: la consola la genera en el
-- momento de la descarga y la incrusta en el .bat, nunca en disco compartido.
--
-- Privado igual que todo: el instalador no debe ser descargable por cualquiera
-- que adivine la URL. Un agente de seguridad sin firmar es una muestra ideal
-- para que un atacante estudie como evadirlo; se sirve solo a usuarios con sesion.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-dist', 'agent-dist', false,
  104857600,  -- 100 MB. El MSI ronda los 5 MB; el margen deja sitio a versiones
              -- futuras con mas recursos empotrados sin tocar la migracion.
  array[
    'application/x-msi',              -- el instalador
    'application/octet-stream',       -- algunos clientes suben el MSI asi
    'application/x-pem-file',         -- console_pubkey.pem
    'text/plain'                      -- la clave publica servida como texto
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- LECTURA: cualquier usuario autenticado puede leer los artefactos. No hay dato
-- de tenant que proteger aqui —el MSI y la clave publica son comunes— y la
-- consola lee estos objetos con la sesion del usuario que pulsa "descargar".
--
-- Sin politica de INSERT ni de DELETE a proposito: los artefactos los publica
-- operaciones desde el panel de Supabase (que usa la clave de servicio y no pasa
-- por estas politicas). Que un usuario de consola no pueda escribir aqui es la
-- intencion: nadie sube un MSI adulterado desde una sesion normal.
drop policy if exists "nortis_agent_dist_read" on storage.objects;

create policy "nortis_agent_dist_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'agent-dist');
