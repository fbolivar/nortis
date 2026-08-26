import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/features/auth/services/session'
import { PageHeader } from '@/shared/components/console-shell'
import { PolicyEditor } from '@/features/policies/components/policy-editor'
import { ProfileAssignment } from '@/features/policies/components/profile-assignment'
import { parsePolicyConfig } from '@/shared/schemas/policy'
import { Badge } from '@/shared/components/ui'

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const session = await getSessionContext()

  const [{ data: profile }, { data: endpoints }, { data: classes }] = await Promise.all([
    supabase.from('security_profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('endpoints').select('id, hostname, assigned_profile_id').order('hostname'),
    supabase
      .from('data_classifications')
      .select('name, sensitive')
      .order('sort_order', { ascending: true }),
  ])

  // RLS ya impide leer perfiles de otro tenant: sin fila, para este usuario el
  // perfil no existe.
  if (!profile) notFound()

  const canEdit = session?.role === 'owner' || session?.role === 'admin'
  const consentSigned = Boolean(session?.organization?.monitoring_consent_signed_at)

  return (
    <>
      <PageHeader
        title={profile.name}
        description={profile.description ?? 'Perfil de seguridad'}
        actions={
          <>
            {profile.is_default ? <Badge tone="info">Por defecto</Badge> : null}
            <Link
              href="/policies"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Volver
            </Link>
          </>
        }
      />

      <div className="page-body space-y-6">
        <ProfileAssignment
          profileId={profile.id}
          profileName={profile.name}
          endpoints={endpoints ?? []}
          canEdit={canEdit}
        />

        <PolicyEditor
          profile={profile}
          initialConfig={parsePolicyConfig(profile.config)}
          endpoints={endpoints ?? []}
          consentSigned={consentSigned}
          canEdit={canEdit}
          classes={classes ?? []}
        />
      </div>
    </>
  )
}
