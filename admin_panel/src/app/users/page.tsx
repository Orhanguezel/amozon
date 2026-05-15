import { UsersPanel } from '@/components/admin/UsersPanel';
import { AdminShell } from '@/components/layout/AdminShell';

export default function Page() {
  return (
    <AdminShell>
      <div className="content">
        <UsersPanel />
      </div>
    </AdminShell>
  );
}
