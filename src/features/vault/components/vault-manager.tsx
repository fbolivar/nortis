'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Download, Lock, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormError,
  Input,
  Label,
  Table,
  Td,
  Th,
} from '@/shared/components/ui'
import { formatDateTime } from '@/lib/utils'
import { formatBytes } from '@/features/telemetry/components/event-row'
import {
  decryptToFile,
  encryptFile,
  randomToken,
  wrapWithCredential,
} from '../services/crypto'
import type { EncryptedDocument } from '@/shared/types/database'

const INTERNAL_BUCKET = 'encrypted-documents'
const SHARED_BUCKET = 'shared-packages'

/** Descarga un Blob con el nombre indicado. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function VaultManager({
  documents,
  organizationId,
  canManage,
}: {
  documents: EncryptedDocument[]
  organizationId: string
  canManage: boolean
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [shareFor, setShareFor] = useState<string>()
  const [recipient, setRecipient] = useState('')
  const [shareResult, setShareResult] = useState<{ url: string; credential: string }>()
  const [copied, setCopied] = useState<'url' | 'credential'>()

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(undefined)
    setBusy('Cifrando en su equipo…')

    try {
      const supabase = createClient()

      // 1. Cifrar en el navegador. El servidor no ve el archivo en claro.
      const encrypted = await encryptFile(file)

      // 2. El servidor envuelve la clave de datos con la clave maestra del
      //    tenant, que vive en Vault. Solo se guarda la clave envuelta.
      setBusy('Protegiendo la clave…')
      const { data: wrapData, error: wrapError } = await supabase.rpc('wrap_data_key', {
        p_data_key: encrypted.dataKey,
      })
      if (wrapError) throw new Error(wrapError.message)

      const wrap = Array.isArray(wrapData) ? wrapData[0] : wrapData
      if (!wrap?.wrapped_key) throw new Error('No se pudo proteger la clave')

      // 3. Registrar el documento ANTES de subir: si la subida falla, queda un
      //    registro huerfano visible y corregible. Al reves quedaria un blob
      //    cifrado sin clave envuelta, es decir, basura indescifrable ocupando
      //    espacio y sin forma de saber que era.
      setBusy('Registrando…')
      const { data: userData } = await supabase.auth.getUser()
      const { data: doc, error: insertError } = await supabase
        .from('encrypted_documents')
        .insert({
          organization_id: organizationId,
          owner_user_id: userData.user?.id ?? null,
          filename_hash: encrypted.filenameHash,
          content_hash: encrypted.contentHash,
          size_bytes: encrypted.plainSize,
          mime_type: file.type || null,
          encryption_scheme: 'aes_256_gcm_tenant_key',
          recipient_type: 'internal',
          wrapped_data_key: wrap.wrapped_key,
          vault_key_id: wrap.vault_key_id,
        })
        .select('id')
        .single()

      if (insertError) throw new Error(insertError.message)

      // 4. Subir el ciphertext.
      setBusy('Subiendo…')
      const path = `${organizationId}/${doc.id}`
      const { error: uploadError } = await supabase.storage
        .from(INTERNAL_BUCKET)
        .upload(path, encrypted.blob, { contentType: 'application/octet-stream' })

      if (uploadError) throw new Error(uploadError.message)

      await supabase
        .from('encrypted_documents')
        .update({ storage_path: path })
        .eq('id', doc.id)

      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fallo el cifrado')
    } finally {
      setBusy(undefined)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function onDownload(document: EncryptedDocument) {
    setError(undefined)
    setBusy('Descargando…')

    try {
      const supabase = createClient()

      if (!document.storage_path) throw new Error('El documento no tiene contenido almacenado')

      const { data: blob, error: downloadError } = await supabase.storage
        .from(INTERNAL_BUCKET)
        .download(document.storage_path)
      if (downloadError) throw new Error(downloadError.message)

      setBusy('Descifrando…')
      const { data: dataKey, error: keyError } = await supabase.rpc('unwrap_data_key', {
        p_document_id: document.id,
      })
      if (keyError) throw new Error(keyError.message)

      const result = await decryptToFile(new Uint8Array(await blob.arrayBuffer()), dataKey as string)
      saveBlob(result.blob, result.filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fallo el descifrado')
    } finally {
      setBusy(undefined)
    }
  }

  async function onShare(document: EncryptedDocument) {
    setError(undefined)
    setBusy('Preparando paquete…')

    try {
      const supabase = createClient()
      if (!document.storage_path) throw new Error('El documento no tiene contenido almacenado')

      // Se recupera la clave de datos y se re-envuelve con una credencial nueva.
      // El archivo NO se vuelve a cifrar: es la misma clave de datos, envuelta
      // dos veces.
      const { data: dataKey, error: keyError } = await supabase.rpc('unwrap_data_key', {
        p_document_id: document.id,
      })
      if (keyError) throw new Error(keyError.message)

      const credential = randomToken(24)
      const token = randomToken(32)
      const { wrappedKey, salt } = await wrapWithCredential(dataKey as string, credential)

      // Se copia el ciphertext al bucket de paquetes. Es el mismo contenido: no
      // hace falta descifrar ni volver a cifrar nada.
      setBusy('Publicando…')
      const { data: blob, error: downloadError } = await supabase.storage
        .from(INTERNAL_BUCKET)
        .download(document.storage_path)
      if (downloadError) throw new Error(downloadError.message)

      const sharedPath = `${organizationId}/${token}`
      const { error: uploadError } = await supabase.storage
        .from(SHARED_BUCKET)
        .upload(sharedPath, blob, { contentType: 'application/octet-stream' })
      if (uploadError) throw new Error(uploadError.message)

      const { data: userData } = await supabase.auth.getUser()
      const { data: shared, error: insertError } = await supabase
        .from('encrypted_documents')
        .insert({
          organization_id: organizationId,
          owner_user_id: userData.user?.id ?? null,
          filename_hash: document.filename_hash,
          content_hash: document.content_hash,
          size_bytes: document.size_bytes,
          mime_type: document.mime_type,
          encryption_scheme: 'aes_256_gcm_ephemeral_rsa',
          recipient_type: 'external',
          external_recipient_email: recipient.trim(),
          // Caducidad obligatoria: un enlace eterno es una fuga con retardo.
          access_expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
          access_max_downloads: 3,
          external_wrapped_key: wrappedKey,
          external_wrap_salt: salt,
          share_token: token,
          storage_path: sharedPath,
        })
        .select('id')
        .single()

      if (insertError) throw new Error(insertError.message)
      if (!shared) throw new Error('No se pudo registrar el envio')

      setShareResult({
        url: `${window.location.origin}/share/${token}`,
        credential,
      })
      setShareFor(undefined)
      setRecipient('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fallo la generacion del paquete')
    } finally {
      setBusy(undefined)
    }
  }

  async function onRevoke(document: EncryptedDocument) {
    setError(undefined)
    setBusy('Revocando…')

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('encrypted_documents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', document.id)
      if (updateError) throw new Error(updateError.message)

      // Se borra tambien el blob compartido. Sin esto, la revocacion solo
      // dejaria de entregar la clave: correcto criptograficamente, pero deja
      // ciphertext accesible indefinidamente y eso no hay por que regalarlo.
      //
      // El error SI se comprueba: la primera version lo ignoraba y el borrado
      // fallaba en silencio por una politica de Storage ausente, mientras la
      // interfaz afirmaba que el archivo se habia eliminado.
      if (document.recipient_type === 'external' && document.storage_path) {
        const { error: removeError } = await supabase.storage
          .from(SHARED_BUCKET)
          .remove([document.storage_path])
        if (removeError) {
          throw new Error(
            `El envio quedo revocado y ya no se entrega la clave, pero no se pudo borrar el archivo cifrado: ${removeError.message}`
          )
        }
      }

      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fallo la revocacion')
    } finally {
      setBusy(undefined)
    }
  }

  async function copy(text: string, what: 'url' | 'credential') {
    await navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(undefined), 2000)
  }

  const internal = documents.filter((d) => d.recipient_type === 'internal')
  const external = documents.filter((d) => d.recipient_type === 'external')

  return (
    <div className="space-y-5">
      {shareResult ? (
        <Callout tone="warning" title="Paquete listo — entregue la credencial por otro canal">
          <p className="mb-3">
            El enlace y la credencial deben viajar por <strong>vias distintas</strong>. Si
            ambos van en el mismo correo, quien intercepte ese correo tiene el documento:
            el cifrado no aporta nada. Envie el enlace por correo y dicte la credencial
            por telefono.
          </p>

          <div className="space-y-2">
            <div>
              <Label>Enlace de descarga</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs">
                  {shareResult.url}
                </code>
                <Button size="sm" variant="secondary" onClick={() => copy(shareResult.url, 'url')}>
                  {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <Label>Credencial de un solo uso</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs">
                  {shareResult.credential}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copy(shareResult.credential, 'credential')}
                >
                  {copied === 'credential' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="mt-1 text-xs">
                Nortis <strong>no guarda</strong> esta credencial. Si la pierde, revoque el
                envio y genere otro: no hay forma de recuperarla.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShareResult(undefined)}
            className="mt-3 text-xs underline underline-offset-2"
          >
            Ya la entregue, ocultar
          </button>
        </Callout>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Cifrar un documento</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInput}
              type="file"
              onChange={onUpload}
              disabled={Boolean(busy)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              El archivo se cifra <strong className="text-foreground">en su equipo</strong>{' '}
              antes de subirse. Nortis nunca recibe el contenido en claro, ni el nombre del
              archivo. Maximo 100 MB.
            </p>
            {busy ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-info">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                {busy}
              </p>
            ) : null}
            <FormError>{error}</FormError>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Documentos cifrados ({internal.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {internal.length === 0 ? (
            <EmptyState
              title="Sin documentos cifrados"
              description="Cifre un documento para guardarlo protegido o para enviarlo a un tercero sin que necesite cuenta en Nortis."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Identificador</Th>
                  <Th>Tamaño</Th>
                  <Th>Cifrado</Th>
                  <Th>Estado</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {internal.map((doc) => (
                  <tr key={doc.id} className="hover:bg-surface-muted/50">
                    <Td className="forensic">{doc.filename_hash.slice(0, 16)}…</Td>
                    <Td className="tabular-nums text-muted-foreground">
                      {formatBytes(doc.size_bytes)}
                    </Td>
                    <Td className="tabular-nums text-muted-foreground">
                      {formatDateTime(doc.created_at)}
                    </Td>
                    <Td>
                      {doc.revoked_at ? (
                        <Badge tone="critical">Revocado</Badge>
                      ) : (
                        <Badge tone="success">Activo</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      {!doc.revoked_at ? (
                        <span className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDownload(doc)}
                            disabled={Boolean(busy)}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Descargar
                          </Button>
                          {canManage ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShareFor(shareFor === doc.id ? undefined : doc.id)}
                              disabled={Boolean(busy)}
                            >
                              <Share2 className="h-3.5 w-3.5" aria-hidden />
                              Enviar
                            </Button>
                          ) : null}
                        </span>
                      ) : null}

                      {shareFor === doc.id ? (
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <Input
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder="destinatario@empresa.com"
                            className="h-7 max-w-56 text-xs"
                          />
                          <Button size="sm" onClick={() => onShare(doc)} disabled={Boolean(busy)}>
                            Generar paquete
                          </Button>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Envios a terceros ({external.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {external.length === 0 ? (
            <EmptyState
              title="Sin envios externos"
              description="Un envio genera un enlace de descarga y una credencial de un solo uso. El destinatario no necesita cuenta."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Destinatario</Th>
                  <Th>Descargas</Th>
                  <Th>Vence</Th>
                  <Th>Estado</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {external.map((doc) => {
                  const expired = doc.access_expires_at
                    ? new Date(doc.access_expires_at) < new Date()
                    : false
                  return (
                    <tr key={doc.id} className="hover:bg-surface-muted/50">
                      <Td>{doc.external_recipient_email ?? '—'}</Td>
                      <Td className="tabular-nums text-muted-foreground">
                        {doc.access_download_count}
                        {doc.access_max_downloads ? ` / ${doc.access_max_downloads}` : ''}
                      </Td>
                      <Td className="tabular-nums text-muted-foreground">
                        {formatDateTime(doc.access_expires_at)}
                      </Td>
                      <Td>
                        {doc.revoked_at ? (
                          <Badge tone="critical">Revocado</Badge>
                        ) : expired ? (
                          <Badge tone="neutral">Vencido</Badge>
                        ) : (
                          <Badge tone="success">Activo</Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        {!doc.revoked_at && canManage ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onRevoke(doc)}
                            disabled={Boolean(busy)}
                          >
                            Revocar
                          </Button>
                        ) : null}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cada documento se cifra con su propia clave, y esa clave se guarda envuelta con la
        clave maestra de su organizacion, custodiada en Supabase Vault. Revocar un envio
        deja de entregar la clave: aunque alguien conserve el archivo descargado a medias,
        queda indescifrable de forma permanente.
      </p>
    </div>
  )
}
