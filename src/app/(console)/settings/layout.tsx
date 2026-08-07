import { SettingsTabs } from '@/features/tenant/components/settings-tabs'
import { PageHeader } from '@/shared/components/console-shell'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Administracion"
        description="Organizacion, usuarios, credenciales de agentes y auditoria"
      />
      <SettingsTabs />
      <div className="page-body">{children}</div>
    </>
  )
}
