import type { Metadata } from 'next';

import { ServiceWorkerCleanup } from '@/components/layout/ServiceWorkerCleanup';
import './globals.css';

export const metadata: Metadata = {
  title: 'Amozon Admin',
  description: 'Amazon scraping ve scoring admin paneli',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ServiceWorkerCleanup />
        {children}
      </body>
    </html>
  );
}
