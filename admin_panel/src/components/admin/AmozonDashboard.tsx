'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, BookOpenText, Code2, KeyRound, PackageSearch, Scale, Settings } from 'lucide-react';
import { apiGet } from '@/integrations/admin-api';
import { actionClass, skuActionLabel, statusLabel, type KeywordOption, type Scan, type Settings as PanelSettings } from './types';

const modules = [
  {
    href: '/keywords',
    icon: KeyRound,
    title: 'Anahtar Kelimeler',
    text: 'Araştırma havuzunu yönet, anahtar kelime ekle, düzenle ve ara.',
  },
  {
    href: '/scans',
    icon: Activity,
    title: 'Araştırmalar',
    text: 'Kayıtlı anahtar kelimelerden canlı Amazon araştırması başlat ve iş durumunu takip et.',
  },
  {
    href: '/products',
    icon: PackageSearch,
    title: 'Ürünler',
    text: 'Tamamlanmış araştırma sonuçlarını ürün, kategori, marka ve satıcı kırılımıyla incele.',
  },
  {
    href: '/theses',
    icon: Scale,
    title: 'Tezler',
    text: 'AL ve Takip Et kararlarından oluşturulan tezleri izle; sinyal değişiminde durum güncellenir.',
  },
  {
    href: '/settings',
    icon: Settings,
    title: 'Ayarlar',
    text: 'Oxylabs, Keepa ve AI API ayarlarını yönet.',
  },
  {
    href: '/documentation',
    icon: BookOpenText,
    title: 'Dokümantasyon',
    text: 'Paneldeki tüm sayfaların amacını ve doğru kullanım akışını incele.',
  },
  {
    href: '/developer-notes',
    icon: Code2,
    title: 'Yazılımcı Notu',
    text: 'Kullanıcı geri bildirimlerini veritabanına kaydet ve hızlı aksiyon al.',
  },
];

type DashboardInitialData = {
  keywords: KeywordOption[];
  scans: Scan[];
  settings: PanelSettings | null;
};

export function AmozonDashboard({ initialData }: { initialData?: DashboardInitialData }) {
  const [keywords, setKeywords] = useState<KeywordOption[]>(initialData?.keywords ?? []);
  const [scans, setScans] = useState<Scan[]>(initialData?.scans ?? []);
  const [settings, setSettings] = useState<PanelSettings | null>(initialData?.settings ?? null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [keywordData, scanData, settingsData] = await Promise.all([
          apiGet<{ keywords: KeywordOption[]; total: number }>('/api/keywords?limit=5'),
          apiGet<{ scans: Scan[] }>('/api/scans'),
          apiGet<PanelSettings>('/api/settings'),
        ]);
        setKeywords(keywordData.keywords);
        setScans(scanData.scans);
        setSettings(settingsData);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Canlı özet alınamadı');
      }
    }

    load();
  }, []);

  const completedScans = useMemo(() => scans.filter((scan) => scan.status === 'done'), [scans]);
  const totalProducts = useMemo(() => completedScans.reduce((sum, scan) => sum + Number(scan.data_points || 0), 0), [completedScans]);
  const latestScans = useMemo(() => completedScans.slice(0, 4), [completedScans]);

  return (
    <div className="content">
      <section className="metrics">
        <div className="metric"><div className="metric-label">Anahtar Kelime</div><div className="metric-value">{keywords.length}</div></div>
        <div className="metric"><div className="metric-label">Araştırma</div><div className="metric-value">{scans.length}</div></div>
        <div className="metric"><div className="metric-label">Tamamlanan</div><div className="metric-value">{completedScans.length}</div></div>
        <div className="metric"><div className="metric-label">Ürün Verisi</div><div className="metric-value">{totalProducts}</div></div>
      </section>

      <section className="panel decision-band">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Canlı Demo Özeti</h2>
            <p className="muted">Panel veri tabanındaki gerçek keyword, araştırma ve entegrasyon durumunu gösterir.</p>
          </div>
        </div>
        <div className="panel-body action-metrics">
          <div className="action-metric">
            <span className={`badge ${settings?.oxylabsConfigured ? 'done' : 'pending'}`}>Oxylabs</span>
            <strong>{settings?.oxylabsConfigured ? 'Aktif' : 'Eksik'}</strong>
          </div>
          <div className="action-metric">
            <span className={`badge ${settings?.keepaConfigured ? 'done' : 'pending'}`}>Keepa</span>
            <strong>{settings?.keepaConfigured ? 'Aktif' : 'Eksik'}</strong>
          </div>
          <div className="action-metric">
            <span className={`badge ${settings?.groqConfigured || settings?.openaiConfigured ? 'done' : 'pending'}`}>AI</span>
            <strong>{settings?.groqConfigured || settings?.openaiConfigured ? 'Aktif' : 'Eksik'}</strong>
          </div>
        </div>
        {message ? <div className="panel-body"><p className="error">{message}</p></div> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Son Tamamlanan Araştırmalar</h2>
            <p className="muted">Demo linkine giren kişi sistemde canlı veri olduğunu ilk ekranda görebilir.</p>
          </div>
          <Link className="button secondary" href="/scans">Araştırmalara Git</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Anahtar Kelime</th><th>Pazar</th><th>Ürün</th><th>Aksiyon</th><th>Durum</th></tr></thead>
            <tbody>
              {latestScans.map((scan) => {
                const action = scan.decision_surface?.primary_action;
                return (
                  <tr key={scan.id}>
                    <td><strong>{scan.keyword}</strong></td>
                    <td>{scan.marketplace}</td>
                    <td>{scan.data_points}</td>
                    <td>{action ? <span className={`badge ${actionClass(action)}`}>{skuActionLabel(action)}</span> : '-'}</td>
                    <td><span className="badge done">{statusLabel(scan.status)}</span></td>
                  </tr>
                );
              })}
              {!latestScans.length ? <tr><td colSpan={5}>Tamamlanmış araştırma henüz görünmüyor.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Operasyon Akışı</h2>
            <p className="muted">Panel sade giriş ekranıdır; detaylı işlemler kendi modülünde tutulur.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="module-grid">
            {modules.map((module) => (
              <Link className="module-card" href={module.href} key={module.href}>
                <module.icon size={20} />
                <strong>{module.title}</strong>
                <span>{module.text}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">MVP Durumu</h2>
            <p className="muted">Çekirdek skorlama, anahtar kelime yönetimi, araştırma, ürün analizi ve ayar modülleri hazır.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="summary-grid">
            <div><span>Backend</span><b>8186</b></div>
            <div><span>Admin</span><b>3096</b></div>
            <div><span>Backend Test</span><b>31 geçti</b></div>
            <div><span>Admin Test</span><b>2 geçti</b></div>
          </div>
        </div>
      </section>
    </div>
  );
}
