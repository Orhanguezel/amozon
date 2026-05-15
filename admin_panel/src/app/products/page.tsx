import { ProductsPanel } from '@/components/admin/ProductsPanel';
import { AdminShell } from '@/components/layout/AdminShell';

export default function Page() {
  return (
    <AdminShell>
      <ProductsPanel />
    </AdminShell>
  );
}
