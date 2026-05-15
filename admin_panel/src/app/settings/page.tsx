import { SettingsPanel } from '@/components/admin/SettingsPanel';
import { AdminShell } from '@/components/layout/AdminShell';

export default function Page() {
  return (
    <AdminShell>
      <SettingsPanel />
    </AdminShell>
  );
}
