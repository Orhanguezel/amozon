import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DocumentationPanel } from '../DocumentationPanel';
import { DeveloperNotesPanel } from '../DeveloperNotesPanel';
import { KeywordsPanel } from '../KeywordsPanel';
import { hasLowCoverageWarning, isStaleScan, ProductsPanel } from '../ProductsPanel';
import { ScansPanel } from '../ScansPanel';
import { SettingsPanel } from '../SettingsPanel';
import { ThesesPanel } from '../ThesesPanel';
import { shouldShowBudgetBanner } from '@/components/layout/AdminShell';
import { operatorAction, thesisStatusLabel } from '../types';

describe('admin panel smoke', () => {
  test('renders core modules without crashing', () => {
    expect(renderToStaticMarkup(<KeywordsPanel />)).toContain('Anahtar Kelime Modülü');
    expect(renderToStaticMarkup(<ScansPanel />)).toContain('Yeni Amazon Araştırması');
    expect(renderToStaticMarkup(<ProductsPanel />)).toContain('Ürün ve Pazar Analizi');
    expect(renderToStaticMarkup(<SettingsPanel />)).toContain('Site Ayarları');
    expect(renderToStaticMarkup(<DocumentationPanel />)).toContain('Sayfa Rehberi');
    expect(renderToStaticMarkup(<DeveloperNotesPanel />)).toContain('Yazılımcı Notu');
    expect(renderToStaticMarkup(<ThesesPanel />)).toContain('Tezler');
  });

  test('maps decisions to operator actions', () => {
    expect(operatorAction('GUVENLI')).toBe('Al');
    expect(operatorAction('DIKKATLI_OL')).toBe('Takip Et');
    expect(operatorAction('INSUFFICIENT_DATA')).toBe('Takip Et');
    expect(operatorAction('GIRME')).toBe('Uzak Dur');
  });

  test('keeps Phase 4 UI warning rules stable', () => {
    expect(isStaleScan({ data_quality: { scan_age_days: 8 } })).toBe(true);
    expect(isStaleScan({ data_quality: { scan_age_days: 6 } })).toBe(false);
    expect(hasLowCoverageWarning({ keepa_coverage: 0.29, seller_coverage: 0.1 })).toBe(true);
    expect(hasLowCoverageWarning({ keepa_coverage: 0.4, seller_coverage: 0.1 })).toBe(false);
    expect(shouldShowBudgetBanner(19, 100)).toBe(true);
    expect(shouldShowBudgetBanner(20, 100)).toBe(false);
  });

  test('maps thesis statuses for operator tabs', () => {
    expect(thesisStatusLabel('active')).toBe('Aktif');
    expect(thesisStatusLabel('weakened')).toBe('Zayıfladı');
    expect(thesisStatusLabel('broken')).toBe('Bozuldu');
    expect(thesisStatusLabel('closed')).toBe('Kapalı');
  });
});
