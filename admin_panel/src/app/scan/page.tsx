import { ScanJourneyPanel } from '@/components/admin/ScanJourneyPanel';
import { AdminShell } from '@/components/layout/AdminShell';

export default function Page() {
  return (
    <AdminShell>
      <div className="content">
        <ScanJourneyPanel />
      </div>
    </AdminShell>
  );
}
