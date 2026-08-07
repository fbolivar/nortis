-- =============================================================================
-- Nortis | 24 - FIX: la revocacion no borraba el archivo compartido
-- =============================================================================
-- DETECTADO EN PRUEBAS. Al revocar un envio, el registro quedaba revocado pero
-- el ciphertext seguia en el bucket.
--
-- Causa: la API de Storage necesita SELECT sobre el objeto para poder
-- eliminarlo, y 'shared-packages' solo tenia politicas de INSERT y DELETE. Que
-- el bucket sea publico no ayuda: la lectura publica va por el endpoint anonimo,
-- no por la API autenticada que usa remove().
--
-- La revocacion seguia siendo criptograficamente efectiva —sin la clave envuelta
-- el ciphertext es indescifrable— pero la interfaz afirmaba que el archivo se
-- eliminaba, y eso no era cierto. Prometer una garantia que no se cumple es peor
-- que no prometerla.
create policy "nortis_shared_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'shared-packages'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
  );
