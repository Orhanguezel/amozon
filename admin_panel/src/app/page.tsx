import { AmozonDashboard } from '@/components/admin/AmozonDashboard';
import type { KeywordOption, Scan, Settings } from '@/components/admin/types';
import { AdminShell } from '@/components/layout/AdminShell';

export const dynamic = 'force-dynamic';

const backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:8186';

async function backendData<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${backendApiUrl}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

export default async function Page() {
  const [keywordData, scanData, settings] = await Promise.all([
    backendData<{ keywords: KeywordOption[]; total: number }>('/api/keywords?limit=5', { keywords: [], total: 0 }),
    backendData<{ scans: Scan[] }>('/api/scans', { scans: [] }),
    backendData<Settings | null>('/api/settings', null),
  ]);

  return (
    <AdminShell>
      <AmozonDashboard initialData={{ keywords: keywordData.keywords, scans: scanData.scans, settings }} />
    </AdminShell>
  );
}
