'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Gauge,
  KeyRound,
  LogOut,
  PackageSearch,
  Play,
  Scale,
  Settings,
} from 'lucide-react';
import { apiGet } from '@/integrations/admin-api';
import { logout } from '@/lib/auth';

const items = [
  { label: 'Panel', icon: Gauge, href: '/' },
  { label: 'Yeni Tarama', icon: Play, href: '/scan', highlight: true },
  { label: 'Anahtar Kelimeler', icon: KeyRound, href: '/keywords' },
  { label: 'Araştırmalar', icon: Activity, href: '/scans' },
  { label: 'Ürünler', icon: PackageSearch, href: '/products' },
  { label: 'Tezler', icon: Scale, href: '/theses' },
  { label: 'Ayarlar', icon: Settings, href: '/settings' },
  { label: 'Dokümantasyon', icon: BookOpenText, href: '/documentation' },
  { label: 'Yazılımcı Notu', icon: Code2, href: '/developer-notes' },
];

export function shouldShowBudgetBanner(remaining?: number | null, total?: number | null) {
  const safeRemaining = Number(remaining ?? 0);
  const safeTotal = Number(total ?? 0);
  return safeTotal > 0 && safeRemaining / safeTotal < 0.2;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [budget, setBudget] = useState<{ remaining: number; total: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setHidden(window.localStorage.getItem('hideKeepaBudgetBanner') === '1');
    setCollapsed(window.localStorage.getItem('amozonSidebarCollapsed') === '1');
    apiGet<{ localDailyBudget?: number; dailyBudget?: number; today?: { remaining?: number; token_budget?: number } | null }>('/api/keepa/usage')
      .then((usage) => {
        const total = Number(usage.today?.token_budget ?? usage.localDailyBudget ?? usage.dailyBudget ?? 0);
        const remaining = Number(usage.today?.remaining ?? total);
        if (shouldShowBudgetBanner(remaining, total)) setBudget({ remaining, total });
      })
      .catch(() => undefined);
  }, []);

  function hideBudgetBanner() {
    window.localStorage.setItem('hideKeepaBudgetBanner', '1');
    setHidden(true);
  }

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('amozonSidebarCollapsed', next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className={`shell${collapsed ? ' shell-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div className="brand-text">
            <div className="brand-title">Amozon</div>
            <div className="brand-subtitle">Amazon skorlama paneli</div>
          </div>
        </div>
        <nav className="nav" aria-label="Yönetim menüsü">
          {items.map((item) => (
            <Link
              className={`nav-item${pathname === item.href ? ' active' : ''}${item.highlight ? ' nav-item-highlight' : ''}`}
              href={item.href}
              key={item.label}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <form action={logout} className="nav-logout">
          <button type="submit" className="nav-item nav-item-logout" title={collapsed ? 'Çıkış Yap' : undefined}>
            <LogOut size={17} />
            <span>Çıkış Yap</span>
          </button>
        </form>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
          title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>
      <main className="main">
        {budget && !hidden ? (
          <div className="budget-banner">
            <span>Keepa günlük kotası azalıyor ({budget.remaining}/{budget.total} kaldı)</span>
            <button onClick={hideBudgetBanner} type="button">Gizle</button>
          </div>
        ) : null}
        <header className="topbar">
          <div>
            <h1>Amazon Araştırma Paneli</h1>
            <p>Anahtar kelime bazlı ürün tarama, skorlama ve operasyon takibi.</p>
          </div>
          <Database size={22} color="var(--brand)" />
        </header>
        {children}
        <footer className="footer">
          <span>Amozon Yönetim</span>
          <span>Amazon tarama ve skorlama operasyon paneli</span>
        </footer>
      </main>
    </div>
  );
}
