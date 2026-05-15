'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet, apiPatch } from '@/integrations/admin-api';
import { UsersPanel } from './UsersPanel';

type SettingsTab = 'api' | 'users';

type Settings = {
  dbName: string | null;
  oxylabsConfigured: boolean;
  keepaConfigured: boolean;
  keepaDailyBudget: number;
  groqConfigured: boolean;
  openaiConfigured: boolean;
  scoringConfig: {
    weights: {
      category_risk: number;
      price_war_risk: number;
      sku_chaos: number;
      brand_reliability: number;
      operational_risk: number;
    };
    thresholds: {
      GUVENLI_MAX: number;
      DIKKATLI_OL_MAX: number;
    };
    confidence: {
      INSUFFICIENT_DATA_MAX: number;
      LOW_MAX: number;
      MEDIUM_MAX: number;
    };
    filters: {
      MIN_REVIEW_COUNT: number;
    };
    scraper: {
      SEARCH_PAGES: number;
      RECOVERY_ENABLED: boolean;
      RECOVERY_PAGES: number;
      RECOVERY_VARIATION_COUNT: number;
      SCRAPER_REVIEW_MIN?: number;
      SCRAPER_REVIEW_MAX?: number;
      SCRAPER_RATING_MIN?: number;
      SCRAPER_RATING_MAX?: number;
      REQUIRE_PRICE_DATA: boolean;
    };
  };
};

type ApiForm = {
  OXYLABS_USERNAME: string;
  OXYLABS_PASSWORD: string;
  KEEPA_API_KEY: string;
  KEEPA_DAILY_TOKEN_BUDGET: string;
  GROQ_API_KEY: string;
  OPENAI_API_KEY: string;
  SCORING_WEIGHT_CATEGORY_RISK: string;
  SCORING_WEIGHT_PRICE_WAR_RISK: string;
  SCORING_WEIGHT_SKU_CHAOS: string;
  SCORING_WEIGHT_BRAND_RELIABILITY: string;
  SCORING_WEIGHT_OPERATIONAL_RISK: string;
  SCORING_THRESHOLD_GUVENLI_MAX: string;
  SCORING_THRESHOLD_DIKKATLI_OL_MAX: string;
  CONFIDENCE_INSUFFICIENT_DATA_MAX: string;
  CONFIDENCE_LOW_MAX: string;
  CONFIDENCE_MEDIUM_MAX: string;
  FILTER_MIN_REVIEW_COUNT: string;
  AMAZON_SEARCH_PAGES: string;
  AMAZON_RECOVERY_ENABLED: string;
  AMAZON_RECOVERY_PAGES: string;
  AMAZON_RECOVERY_VARIATION_COUNT: string;
  AMAZON_SCRAPER_REVIEW_MIN: string;
  AMAZON_SCRAPER_REVIEW_MAX: string;
  AMAZON_SCRAPER_RATING_MIN: string;
  AMAZON_SCRAPER_RATING_MAX: string;
  REQUIRE_PRICE_DATA: string;
};

const emptyForm: ApiForm = {
  OXYLABS_USERNAME: '',
  OXYLABS_PASSWORD: '',
  KEEPA_API_KEY: '',
  KEEPA_DAILY_TOKEN_BUDGET: '',
  GROQ_API_KEY: '',
  OPENAI_API_KEY: '',
  SCORING_WEIGHT_CATEGORY_RISK: '',
  SCORING_WEIGHT_PRICE_WAR_RISK: '',
  SCORING_WEIGHT_SKU_CHAOS: '',
  SCORING_WEIGHT_BRAND_RELIABILITY: '',
  SCORING_WEIGHT_OPERATIONAL_RISK: '',
  SCORING_THRESHOLD_GUVENLI_MAX: '',
  SCORING_THRESHOLD_DIKKATLI_OL_MAX: '',
  CONFIDENCE_INSUFFICIENT_DATA_MAX: '',
  CONFIDENCE_LOW_MAX: '',
  CONFIDENCE_MEDIUM_MAX: '',
  FILTER_MIN_REVIEW_COUNT: '',
  AMAZON_SEARCH_PAGES: '',
  AMAZON_RECOVERY_ENABLED: '',
  AMAZON_RECOVERY_PAGES: '',
  AMAZON_RECOVERY_VARIATION_COUNT: '',
  AMAZON_SCRAPER_REVIEW_MIN: '',
  AMAZON_SCRAPER_REVIEW_MAX: '',
  AMAZON_SCRAPER_RATING_MIN: '',
  AMAZON_SCRAPER_RATING_MAX: '',
  REQUIRE_PRICE_DATA: '',
};

type KeepaUsage = {
  configured: boolean;
  localDailyBudget: number;
  dailyBudget: number;
  live: {
    ok: boolean;
    tokensLeft: number | null;
    refillRate: number | null;
    refillIn: number | null;
    tokensConsumed: number | null;
    tokenFlowReduction: number | null;
    checkedAt: string;
    error?: string;
  };
  today: null | {
    budget_date: string;
    token_budget: number;
    tokens_used: number;
    remaining: number;
  };
  history: Array<{
    budget_date: string;
    token_budget: number;
    tokens_used: number;
    remaining: number;
  }>;
  queue: {
    pending: number;
    done_today: number;
    failed_total: number;
  };
};

type Health = {
  status: string;
  uptime_seconds: number;
  errors_last_24h: number;
  keepa: { budget_remaining: number; budget_total: number; queue_pending: number };
  scheduler: { last_keepa_run: string | null; last_seller_run: string | null };
};

function BoolBadge({ active }: { active: boolean }) {
  return <span className={`badge ${active ? 'done' : 'pending'}`}>{active ? 'aktif' : 'yapılandırılmamış'}</span>;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [usage, setUsage] = useState<KeepaUsage | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [form, setForm] = useState<ApiForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');

  async function refresh() {
    setError(null);
    try {
      const [settingsData, usageData, healthData] = await Promise.all([
        apiGet<Settings>('/api/settings'),
        apiGet<KeepaUsage>('/api/keepa/usage'),
        apiGet<Health>('/api/health'),
      ]);
      setSettings(settingsData);
      setUsage(usageData);
      setHealth(healthData);
      setForm((current) => ({
        ...current,
        KEEPA_DAILY_TOKEN_BUDGET: current.KEEPA_DAILY_TOKEN_BUDGET || String(settingsData.keepaDailyBudget || ''),
        SCORING_WEIGHT_CATEGORY_RISK: current.SCORING_WEIGHT_CATEGORY_RISK || String(settingsData.scoringConfig.weights.category_risk),
        SCORING_WEIGHT_PRICE_WAR_RISK: current.SCORING_WEIGHT_PRICE_WAR_RISK || String(settingsData.scoringConfig.weights.price_war_risk),
        SCORING_WEIGHT_SKU_CHAOS: current.SCORING_WEIGHT_SKU_CHAOS || String(settingsData.scoringConfig.weights.sku_chaos),
        SCORING_WEIGHT_BRAND_RELIABILITY: current.SCORING_WEIGHT_BRAND_RELIABILITY || String(settingsData.scoringConfig.weights.brand_reliability),
        SCORING_WEIGHT_OPERATIONAL_RISK: current.SCORING_WEIGHT_OPERATIONAL_RISK || String(settingsData.scoringConfig.weights.operational_risk),
        SCORING_THRESHOLD_GUVENLI_MAX: current.SCORING_THRESHOLD_GUVENLI_MAX || String(settingsData.scoringConfig.thresholds.GUVENLI_MAX),
        SCORING_THRESHOLD_DIKKATLI_OL_MAX: current.SCORING_THRESHOLD_DIKKATLI_OL_MAX || String(settingsData.scoringConfig.thresholds.DIKKATLI_OL_MAX),
        CONFIDENCE_INSUFFICIENT_DATA_MAX: current.CONFIDENCE_INSUFFICIENT_DATA_MAX || String(settingsData.scoringConfig.confidence.INSUFFICIENT_DATA_MAX),
        CONFIDENCE_LOW_MAX: current.CONFIDENCE_LOW_MAX || String(settingsData.scoringConfig.confidence.LOW_MAX),
        CONFIDENCE_MEDIUM_MAX: current.CONFIDENCE_MEDIUM_MAX || String(settingsData.scoringConfig.confidence.MEDIUM_MAX),
        FILTER_MIN_REVIEW_COUNT: current.FILTER_MIN_REVIEW_COUNT || String(settingsData.scoringConfig.filters.MIN_REVIEW_COUNT),
        AMAZON_SEARCH_PAGES: current.AMAZON_SEARCH_PAGES || String(settingsData.scoringConfig.scraper.SEARCH_PAGES),
        AMAZON_RECOVERY_ENABLED: current.AMAZON_RECOVERY_ENABLED || String(settingsData.scoringConfig.scraper.RECOVERY_ENABLED),
        AMAZON_RECOVERY_PAGES: current.AMAZON_RECOVERY_PAGES || String(settingsData.scoringConfig.scraper.RECOVERY_PAGES),
        AMAZON_RECOVERY_VARIATION_COUNT: current.AMAZON_RECOVERY_VARIATION_COUNT || String(settingsData.scoringConfig.scraper.RECOVERY_VARIATION_COUNT),
        AMAZON_SCRAPER_REVIEW_MIN: current.AMAZON_SCRAPER_REVIEW_MIN || String(settingsData.scoringConfig.scraper.SCRAPER_REVIEW_MIN ?? ''),
        AMAZON_SCRAPER_REVIEW_MAX: current.AMAZON_SCRAPER_REVIEW_MAX || String(settingsData.scoringConfig.scraper.SCRAPER_REVIEW_MAX ?? ''),
        AMAZON_SCRAPER_RATING_MIN: current.AMAZON_SCRAPER_RATING_MIN || String(settingsData.scoringConfig.scraper.SCRAPER_RATING_MIN ?? ''),
        AMAZON_SCRAPER_RATING_MAX: current.AMAZON_SCRAPER_RATING_MAX || String(settingsData.scoringConfig.scraper.SCRAPER_RATING_MAX ?? ''),
        REQUIRE_PRICE_DATA: current.REQUIRE_PRICE_DATA || String(settingsData.scoringConfig.scraper.REQUIRE_PRICE_DATA),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ayarlar alınamadı');
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = usage?.today;
  const used = numberValue(today?.tokens_used);
  const budget = numberValue(today?.token_budget || usage?.localDailyBudget || usage?.dailyBudget);
  const remaining = numberValue(today?.remaining || Math.max(0, budget - used));
  const usedPct = useMemo(() => budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0, [budget, used]);
  const liveTokensLeft = usage?.live?.tokensLeft;
  const liveRefillRate = usage?.live?.refillRate;
  const liveRefillIn = usage?.live?.refillIn;
  const liveTokensConsumed = usage?.live?.tokensConsumed;
  const keepaLiveKnown = Boolean(usage?.live);

  function updateField(key: keyof ApiForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, value]) => value.trim() !== ''),
      );
      const result = await apiPatch<{ ok: boolean; updatedKeys: string[] }>('/api/settings', payload);
      setSavedMessage(result.updatedKeys.length ? `Kaydedildi: ${result.updatedKeys.join(', ')}` : 'Değişiklik yok.');
      setForm((current) => ({
        ...emptyForm,
        KEEPA_DAILY_TOKEN_BUDGET: current.KEEPA_DAILY_TOKEN_BUDGET,
        SCORING_WEIGHT_CATEGORY_RISK: current.SCORING_WEIGHT_CATEGORY_RISK,
        SCORING_WEIGHT_PRICE_WAR_RISK: current.SCORING_WEIGHT_PRICE_WAR_RISK,
        SCORING_WEIGHT_SKU_CHAOS: current.SCORING_WEIGHT_SKU_CHAOS,
        SCORING_WEIGHT_BRAND_RELIABILITY: current.SCORING_WEIGHT_BRAND_RELIABILITY,
        SCORING_WEIGHT_OPERATIONAL_RISK: current.SCORING_WEIGHT_OPERATIONAL_RISK,
        SCORING_THRESHOLD_GUVENLI_MAX: current.SCORING_THRESHOLD_GUVENLI_MAX,
        SCORING_THRESHOLD_DIKKATLI_OL_MAX: current.SCORING_THRESHOLD_DIKKATLI_OL_MAX,
        CONFIDENCE_INSUFFICIENT_DATA_MAX: current.CONFIDENCE_INSUFFICIENT_DATA_MAX,
        CONFIDENCE_LOW_MAX: current.CONFIDENCE_LOW_MAX,
        CONFIDENCE_MEDIUM_MAX: current.CONFIDENCE_MEDIUM_MAX,
        FILTER_MIN_REVIEW_COUNT: current.FILTER_MIN_REVIEW_COUNT,
        AMAZON_SEARCH_PAGES: current.AMAZON_SEARCH_PAGES,
        AMAZON_RECOVERY_ENABLED: current.AMAZON_RECOVERY_ENABLED,
        AMAZON_RECOVERY_PAGES: current.AMAZON_RECOVERY_PAGES,
        AMAZON_RECOVERY_VARIATION_COUNT: current.AMAZON_RECOVERY_VARIATION_COUNT,
        AMAZON_SCRAPER_REVIEW_MIN: current.AMAZON_SCRAPER_REVIEW_MIN,
        AMAZON_SCRAPER_REVIEW_MAX: current.AMAZON_SCRAPER_REVIEW_MAX,
        AMAZON_SCRAPER_RATING_MIN: current.AMAZON_SCRAPER_RATING_MIN,
        AMAZON_SCRAPER_RATING_MAX: current.AMAZON_SCRAPER_RATING_MAX,
        REQUIRE_PRICE_DATA: current.REQUIRE_PRICE_DATA,
      }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ayarlar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content">
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab${activeTab === 'api' ? ' active' : ''}`}
          onClick={() => setActiveTab('api')}
        >
          API & Skorlama
        </button>
        <button
          type="button"
          className={`settings-tab${activeTab === 'users' ? ' active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Kullanıcılar
        </button>
      </div>
      {activeTab === 'users' ? <UsersPanel /> : (<>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Site Ayarları</h2>
            <p className="muted">API tabı, backend `.env` değerlerini yönetir. Keepa gerçek token durumu canlı API'den, yerel limit ise bizim DB sayaçlarımızdan okunur.</p>
          </div>
          <button className="button" onClick={refresh} type="button">
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
        <div className="panel-body">
          {error ? <p className="error">{error}</p> : null}
          {savedMessage ? <p className="muted">{savedMessage}</p> : null}
          <div className="settings-grid">
            <div className="score-card">
              <strong>Oxylabs</strong>
              <div className="score-row"><span>Amazon tarama</span><BoolBadge active={Boolean(settings?.oxylabsConfigured)} /></div>
            </div>
            <div className="score-card">
              <strong>Keepa</strong>
              <div className="score-row"><span>API anahtarı</span><BoolBadge active={Boolean(settings?.keepaConfigured)} /></div>
              <div className="score-row"><span>Canlı token</span><b>{usage?.live?.ok ? liveTokensLeft ?? '-' : keepaLiveKnown ? 'ölçülemedi' : 'yükleniyor'}</b></div>
              <div className="score-row"><span>Yerel günlük limit</span><b>{settings?.keepaDailyBudget ?? '-'}</b></div>
            </div>
            <div className="score-card">
              <strong>AI Yorum Analizi</strong>
              <div className="score-row"><span>Groq</span><BoolBadge active={Boolean(settings?.groqConfigured)} /></div>
              <div className="score-row"><span>OpenAI</span><BoolBadge active={Boolean(settings?.openaiConfigured)} /></div>
            </div>
            <div className="score-card">
              <strong>Veritabanı</strong>
              <div className="score-row"><span>Veritabanı</span><b>{settings?.dbName || '-'}</b></div>
            </div>
            <div className="score-card">
              <strong>Sağlık</strong>
              <div className="score-row"><span>Durum</span><BoolBadge active={health?.status === 'ok'} /></div>
              <div className="score-row"><span>Uptime</span><b>{health ? `${Math.round(health.uptime_seconds / 60)} dk` : '-'}</b></div>
              <div className="score-row"><span>24s hata</span><b>{health?.errors_last_24h ?? '-'}</b></div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">API Kodları</h2>
            <p className="muted">Boş bıraktığın gizli alanlar mevcut değeri korur. Keepa yerel günlük limit gerçek paket değildir; bu sistemin harcamayı sınırlamak için kullandığı güvenlik frenidir.</p>
          </div>
          <button className="button" disabled={saving} onClick={saveSettings} type="button">
            {saving ? 'Kaydediliyor' : 'Kaydet'}
          </button>
        </div>
        <div className="panel-body">
          <div className="api-form-grid">
            <label className="field">
              <span>Oxylabs Kullanıcı Adı</span>
              <input className="input" value={form.OXYLABS_USERNAME} onChange={(event) => updateField('OXYLABS_USERNAME', event.target.value)} placeholder={settings?.oxylabsConfigured ? 'Mevcut değer korunur' : 'Zorunlu'} />
            </label>
            <label className="field">
              <span>Oxylabs Şifre</span>
              <input className="input" type="password" value={form.OXYLABS_PASSWORD} onChange={(event) => updateField('OXYLABS_PASSWORD', event.target.value)} placeholder={settings?.oxylabsConfigured ? 'Mevcut değer korunur' : 'Zorunlu'} />
            </label>
            <label className="field">
              <span>Keepa API Anahtarı</span>
              <input className="input" type="password" value={form.KEEPA_API_KEY} onChange={(event) => updateField('KEEPA_API_KEY', event.target.value)} placeholder={settings?.keepaConfigured ? 'Mevcut değer korunur' : 'Opsiyonel'} />
            </label>
            <label className="field">
              <span>Keepa Yerel Günlük Limit</span>
              <input className="input" type="number" value={form.KEEPA_DAILY_TOKEN_BUDGET} onChange={(event) => updateField('KEEPA_DAILY_TOKEN_BUDGET', event.target.value)} placeholder="Örn. 300" />
            </label>
            <label className="field">
              <span>Groq API Anahtarı</span>
              <input className="input" type="password" value={form.GROQ_API_KEY} onChange={(event) => updateField('GROQ_API_KEY', event.target.value)} placeholder={settings?.groqConfigured ? 'Mevcut değer korunur' : 'Opsiyonel'} />
            </label>
            <label className="field">
              <span>OpenAI API Anahtarı</span>
              <input className="input" type="password" value={form.OPENAI_API_KEY} onChange={(event) => updateField('OPENAI_API_KEY', event.target.value)} placeholder={settings?.openaiConfigured ? 'Mevcut değer korunur' : 'Opsiyonel'} />
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Skorlama Ayarları</h2>
            <p className="muted">Ağırlık ve karar eşikleri kaydedildikten sonraki araştırmalarda kullanılır.</p>
          </div>
          <button className="button" disabled={saving} onClick={saveSettings} type="button">
            {saving ? 'Kaydediliyor' : 'Kaydet'}
          </button>
        </div>
        <div className="panel-body">
          <div className="api-form-grid">
            <label className="field">
              <span>Kategori Risk Ağırlığı</span>
              <input className="input" max="1" min="0" step="0.01" type="number" value={form.SCORING_WEIGHT_CATEGORY_RISK} onChange={(event) => updateField('SCORING_WEIGHT_CATEGORY_RISK', event.target.value)} />
            </label>
            <label className="field">
              <span>Fiyat Savaşı Ağırlığı</span>
              <input className="input" max="1" min="0" step="0.01" type="number" value={form.SCORING_WEIGHT_PRICE_WAR_RISK} onChange={(event) => updateField('SCORING_WEIGHT_PRICE_WAR_RISK', event.target.value)} />
            </label>
            <label className="field">
              <span>SKU Karmaşası Ağırlığı</span>
              <input className="input" max="1" min="0" step="0.01" type="number" value={form.SCORING_WEIGHT_SKU_CHAOS} onChange={(event) => updateField('SCORING_WEIGHT_SKU_CHAOS', event.target.value)} />
            </label>
            <label className="field">
              <span>Marka Güveni Ağırlığı</span>
              <input className="input" max="1" min="0" step="0.01" type="number" value={form.SCORING_WEIGHT_BRAND_RELIABILITY} onChange={(event) => updateField('SCORING_WEIGHT_BRAND_RELIABILITY', event.target.value)} />
            </label>
            <label className="field">
              <span>Operasyon Riski Ağırlığı</span>
              <input className="input" max="1" min="0" step="0.01" type="number" value={form.SCORING_WEIGHT_OPERATIONAL_RISK} onChange={(event) => updateField('SCORING_WEIGHT_OPERATIONAL_RISK', event.target.value)} />
            </label>
            <label className="field">
              <span>Güvenli Üst Sınırı</span>
              <input className="input" max="10" min="0" step="0.1" type="number" value={form.SCORING_THRESHOLD_GUVENLI_MAX} onChange={(event) => updateField('SCORING_THRESHOLD_GUVENLI_MAX', event.target.value)} />
            </label>
            <label className="field">
              <span>Dikkatli Ol Üst Sınırı</span>
              <input className="input" max="10" min="0" step="0.1" type="number" value={form.SCORING_THRESHOLD_DIKKATLI_OL_MAX} onChange={(event) => updateField('SCORING_THRESHOLD_DIKKATLI_OL_MAX', event.target.value)} />
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Veri Kurtarma Ayarları</h2>
            <p className="muted">Yetersiz veri durumunda daha fazla sayfa, AI keyword varyasyonu ve kalite filtreleri burada yönetilir.</p>
          </div>
          <button className="button" disabled={saving} onClick={saveSettings} type="button">
            {saving ? 'Kaydediliyor' : 'Kaydet'}
          </button>
        </div>
        <div className="panel-body">
          <div className="api-form-grid">
            <label className="field">
              <span>Normal Sayfa Sayısı</span>
              <input className="input" min="1" max="20" type="number" value={form.AMAZON_SEARCH_PAGES} onChange={(event) => updateField('AMAZON_SEARCH_PAGES', event.target.value)} />
            </label>
            <label className="field">
              <span>Kurtarma Aktif</span>
              <select className="select" value={form.AMAZON_RECOVERY_ENABLED} onChange={(event) => updateField('AMAZON_RECOVERY_ENABLED', event.target.value)}>
                <option value="true">Aktif</option>
                <option value="false">Pasif</option>
              </select>
            </label>
            <label className="field">
              <span>Kurtarma Sayfa Sayısı</span>
              <input className="input" min="1" max="20" type="number" value={form.AMAZON_RECOVERY_PAGES} onChange={(event) => updateField('AMAZON_RECOVERY_PAGES', event.target.value)} />
            </label>
            <label className="field">
              <span>AI Varyasyon Adedi</span>
              <input className="input" min="0" max="10" type="number" value={form.AMAZON_RECOVERY_VARIATION_COUNT} onChange={(event) => updateField('AMAZON_RECOVERY_VARIATION_COUNT', event.target.value)} />
            </label>
            <label className="field">
              <span>Min Review</span>
              <input className="input" min="0" type="number" value={form.FILTER_MIN_REVIEW_COUNT} onChange={(event) => updateField('FILTER_MIN_REVIEW_COUNT', event.target.value)} />
            </label>
            <label className="field">
              <span>Karar İçin Min Veri</span>
              <input className="input" min="0" type="number" value={form.CONFIDENCE_LOW_MAX} onChange={(event) => updateField('CONFIDENCE_LOW_MAX', event.target.value)} />
            </label>
            <label className="field">
              <span>Yetersiz Veri Üst Sınırı</span>
              <input className="input" min="0" type="number" value={form.CONFIDENCE_INSUFFICIENT_DATA_MAX} onChange={(event) => updateField('CONFIDENCE_INSUFFICIENT_DATA_MAX', event.target.value)} />
            </label>
            <label className="field">
              <span>Yüksek Güven Üst Sınırı</span>
              <input className="input" min="0" type="number" value={form.CONFIDENCE_MEDIUM_MAX} onChange={(event) => updateField('CONFIDENCE_MEDIUM_MAX', event.target.value)} />
            </label>
            <label className="field">
              <span>Scraper Min Review</span>
              <input className="input" min="0" type="number" value={form.AMAZON_SCRAPER_REVIEW_MIN} onChange={(event) => updateField('AMAZON_SCRAPER_REVIEW_MIN', event.target.value)} placeholder="Boş: filtre yok" />
            </label>
            <label className="field">
              <span>Scraper Max Review</span>
              <input className="input" min="0" type="number" value={form.AMAZON_SCRAPER_REVIEW_MAX} onChange={(event) => updateField('AMAZON_SCRAPER_REVIEW_MAX', event.target.value)} placeholder="Boş: filtre yok" />
            </label>
            <label className="field">
              <span>Scraper Min Puan</span>
              <input className="input" min="0" max="5" step="0.1" type="number" value={form.AMAZON_SCRAPER_RATING_MIN} onChange={(event) => updateField('AMAZON_SCRAPER_RATING_MIN', event.target.value)} placeholder="Boş: filtre yok" />
            </label>
            <label className="field">
              <span>Scraper Max Puan</span>
              <input className="input" min="0" max="5" step="0.1" type="number" value={form.AMAZON_SCRAPER_RATING_MAX} onChange={(event) => updateField('AMAZON_SCRAPER_RATING_MAX', event.target.value)} placeholder="Boş: filtre yok" />
            </label>
            <label className="field">
              <span>Fiyat Verisi Zorunlu</span>
              <select className="select" value={form.REQUIRE_PRICE_DATA} onChange={(event) => updateField('REQUIRE_PRICE_DATA', event.target.value)}>
                <option value="false">Hayır</option>
                <option value="true">Evet</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Keepa Token Kullanımı</h2>
            <p className="muted">Canlı Keepa hesabı API'den ölçülür; yerel günlük limit ise bu sistemin harcama freni olarak kullanılır.</p>
          </div>
          <span className="muted">Yerel limit {usedPct}% dolu</span>
        </div>
        <div className="panel-body">
          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Canlı Kalan Token</div>
              <div className="metric-value">{usage?.live?.ok ? liveTokensLeft ?? '-' : '-'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Canlı Refill Rate</div>
              <div className="metric-value">{usage?.live?.ok ? liveRefillRate ?? '-' : '-'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Refill Süresi</div>
              <div className="metric-value">{usage?.live?.ok && liveRefillIn != null ? `${liveRefillIn}s` : '-'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Toplam Tüketim</div>
              <div className="metric-value">{usage?.live?.ok ? liveTokensConsumed ?? '-' : '-'}</div>
            </div>
          </div>
          {keepaLiveKnown && !usage?.live?.ok ? (
            <p className="error" style={{ marginTop: 14 }}>Keepa canlı token durumu ölçülemedi: {usage?.live?.error || 'API anahtarı eksik ya da Keepa yanıt vermedi.'}</p>
          ) : usage?.live?.ok ? (
            <p className="muted" style={{ marginTop: 14 }}>Son canlı ölçüm: {usage.live.checkedAt ? new Date(usage.live.checkedAt).toLocaleString('tr-TR') : '-'}</p>
          ) : (
            <p className="muted" style={{ marginTop: 14 }}>Keepa canlı token durumu yükleniyor.</p>
          )}
          <div className="keepa-section-title">Yerel Günlük Limit Kullanımı</div>
          <div className="usage-line">
            <div className="usage-bar" style={{ width: `${usedPct}%` }} />
          </div>
          <div className="metrics" style={{ marginTop: 14 }}>
            <div className="metric">
              <div className="metric-label">Kullanılan</div>
              <div className="metric-value">{used}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Yerel Limit</div>
              <div className="metric-value">{budget}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Kalan</div>
              <div className="metric-value">{remaining}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Kuyruk</div>
              <div className="metric-value">{numberValue(usage?.queue.pending)}</div>
            </div>
          </div>
          <div className="settings-grid" style={{ marginTop: 14 }}>
            <div className="score-card">
              <strong>Bugün Tamamlanan</strong>
              <div className="metric-value">{numberValue(usage?.queue.done_today)}</div>
            </div>
            <div className="score-card">
              <strong>Başarısız Toplam</strong>
              <div className="metric-value">{numberValue(usage?.queue.failed_total)}</div>
            </div>
          </div>
          {usage?.history?.length ? (
            <div className="history-bars">
              {[...usage.history].reverse().map((day) => {
                const pct = day.token_budget > 0 ? Math.min(100, Math.round((day.tokens_used / day.token_budget) * 100)) : 0;
                return (
                  <div className="history-item" key={day.budget_date}>
                    <div className="history-label">{String(day.budget_date).slice(5, 10)}</div>
                    <div className="history-track"><span style={{ width: `${pct}%` }} /></div>
                    <div className="history-value">{day.tokens_used}/{day.token_budget}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
      </>)}
    </div>
  );
}
