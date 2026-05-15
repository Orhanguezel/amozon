'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Save, Search, Sparkles, Trash2, X } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/integrations/admin-api';
import type { KeywordOption } from './types';

type KeywordResponse = {
  keywords: KeywordOption[];
  total: number;
  limit: number;
  offset: number;
};

const pageSize = 50;

export function KeywordsPanel() {
  const [keywords, setKeywords] = useState<KeywordOption[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [draftMarketplace, setDraftMarketplace] = useState('com');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKeyword, setEditingKeyword] = useState('');
  const [editingMarketplace, setEditingMarketplace] = useState('com');
  const [variationSource, setVariationSource] = useState('');
  const [variationMarketplace, setVariationMarketplace] = useState('com');
  const [variations, setVariations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const page = useMemo(() => Math.floor(offset / pageSize) + 1, [offset]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  async function load(nextOffset = offset, q = query) {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(nextOffset) });
    if (q.trim()) params.set('q', q.trim());
    const response = await apiGet<KeywordResponse>(`/api/keywords?${params.toString()}`);
    setKeywords(response.keywords);
    setTotal(response.total);
    setOffset(response.offset);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load(0, query).catch((error) => setMessage(error instanceof Error ? error.message : 'Anahtar kelime listesi alınamadı'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function createKeyword() {
    const keyword = draft.trim();
    if (!keyword) {
      setMessage('Anahtar kelime boş olamaz');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await apiPost<KeywordOption>('/api/keywords', { keyword, marketplace: draftMarketplace });
      setDraft('');
      setDraftMarketplace('com');
      await load(0, query);
      setMessage('Anahtar kelime kaydedildi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Anahtar kelime kaydedilemedi');
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(option: KeywordOption) {
    setEditingId(option.id);
    setEditingKeyword(option.keyword);
    setEditingMarketplace(option.marketplace || 'com');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingKeyword('');
    setEditingMarketplace('com');
  }

  async function updateKeyword() {
    if (!editingId) return;
    const keyword = editingKeyword.trim();
    if (!keyword) {
      setMessage('Anahtar kelime boş olamaz');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await apiPatch<KeywordOption>(`/api/keywords/${editingId}`, { keyword, marketplace: editingMarketplace });
      cancelEdit();
      await load(offset, query);
      setMessage('Anahtar kelime güncellendi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Anahtar kelime güncellenemedi');
    } finally {
      setLoading(false);
    }
  }

  async function removeKeyword(option: KeywordOption) {
    setLoading(true);
    setMessage(null);
    try {
      await apiDelete<{ ok: boolean }>(`/api/keywords/${option.id}`);
      await load(offset, query);
      setMessage('Anahtar kelime silindi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Anahtar kelime silinemedi');
    } finally {
      setLoading(false);
    }
  }

  async function generateVariations(source = variationSource.trim() || draft.trim() || keywords[0]?.keyword || '') {
    const keyword = source.trim();
    if (!keyword) {
      setMessage('Varyasyon üretmek için anahtar kelime seç veya yaz.');
      return;
    }
    setAiLoading(true);
    setMessage(null);
    try {
      const response = await apiPost<{ keyword: string; variations: string[] }>('/api/keywords/variations', { keyword, count: 6 });
      setVariationSource(response.keyword);
      setVariations(response.variations);
      setMessage(response.variations.length ? 'AI varyasyonları üretildi.' : 'Varyasyon üretilemedi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI varyasyonları üretilemedi');
    } finally {
      setAiLoading(false);
    }
  }

  async function addVariation(keyword: string) {
    setLoading(true);
    setMessage(null);
    try {
      await apiPost<KeywordOption>('/api/keywords', { keyword, marketplace: variationMarketplace });
      await load(0, query);
      setVariations((current) => current.filter((item) => item !== keyword));
      setMessage('Varyasyon anahtar kelime havuzuna eklendi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Varyasyon eklenemedi');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Anahtar Kelime Modülü</h2>
            <p className="muted">Araştırma aramasında kullanılacak anahtar kelime havuzunu yönet.</p>
          </div>
          <button className="button" onClick={() => load(offset, query)} type="button">
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
        <div className="panel-body">
          {message ? <p className={message.startsWith('API_ERROR') ? 'error' : 'muted'}>{message}</p> : null}
          <div className="keyword-manager-form">
            <input className="input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Yeni anahtar kelime" />
            <select className="select" value={draftMarketplace} onChange={(event) => setDraftMarketplace(event.target.value)}>
              <option value="com">amazon.com</option>
              <option value="de">amazon.de</option>
              <option value="co.uk">amazon.co.uk</option>
              <option value="com.tr">amazon.com.tr</option>
            </select>
            <button className="button" disabled={loading} onClick={createKeyword} type="button">
              <Plus size={16} />
              Ekle
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">AI Keyword Genişletme</h2>
            <p className="muted">Bir anahtar kelimeden daha dolu Amazon sonuçları verebilecek varyasyonlar üret.</p>
          </div>
          <button className="button" disabled={aiLoading} onClick={() => generateVariations()} type="button">
            <Sparkles size={16} />
            {aiLoading ? 'Üretiliyor' : 'AI ile Üret'}
          </button>
        </div>
        <div className="panel-body">
          <div className="keyword-manager-form">
            <input
              className="input"
              onChange={(event) => setVariationSource(event.target.value)}
              placeholder="Örn: surge protector"
              value={variationSource}
            />
            <select className="select" value={variationMarketplace} onChange={(event) => setVariationMarketplace(event.target.value)}>
              <option value="com">amazon.com</option>
              <option value="de">amazon.de</option>
              <option value="co.uk">amazon.co.uk</option>
              <option value="com.tr">amazon.com.tr</option>
            </select>
          </div>
          {variations.length ? (
            <div className="variation-list">
              {variations.map((variation) => (
                <div className="variation-item" key={variation}>
                  <span>{variation}</span>
                  <button className="button secondary" disabled={loading} onClick={() => addVariation(variation)} type="button">
                    <Plus size={14} />
                    Havuza Ekle
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Henüz öneri üretilmedi.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Kayıtlı Anahtar Kelimeler</h2>
            <p className="muted">{total} kayıt · Sayfa {page}/{pageCount}</p>
          </div>
          <div className="keyword-search compact">
            <Search size={16} />
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Anahtar kelime ara" />
          </div>
        </div>
        <div className="panel-body">
          <div className="keyword-list">
            {keywords.map((option) => {
              const editing = editingId === option.id;
              return (
                <div className="keyword-list-item" key={option.id}>
                  {editing ? (
                    <>
                      <input className="input" value={editingKeyword} onChange={(event) => setEditingKeyword(event.target.value)} />
                      <select className="select" value={editingMarketplace} onChange={(event) => setEditingMarketplace(event.target.value)}>
                        <option value="com">amazon.com</option>
                        <option value="de">amazon.de</option>
                        <option value="co.uk">amazon.co.uk</option>
                        <option value="com.tr">amazon.com.tr</option>
                      </select>
                      <button className="icon-button" disabled={loading} onClick={updateKeyword} title="Kaydet" type="button"><Save size={16} /></button>
                      <button className="icon-button" disabled={loading} onClick={cancelEdit} title="Vazgeç" type="button"><X size={16} /></button>
                    </>
                  ) : (
                    <>
                      <div className="keyword-chip">{option.keyword} · {option.marketplace}</div>
                      <button className="icon-button" disabled={aiLoading} onClick={() => generateVariations(option.keyword)} title="AI varyasyon üret" type="button"><Sparkles size={16} /></button>
                      <button className="icon-button" disabled={loading} onClick={() => beginEdit(option)} title="Düzenle" type="button"><Pencil size={16} /></button>
                      <button className="icon-button danger" disabled={loading} onClick={() => removeKeyword(option)} title="Sil" type="button"><Trash2 size={16} /></button>
                    </>
                  )}
                </div>
              );
            })}
            {!keywords.length ? <p className="muted">Anahtar kelime bulunamadı.</p> : null}
          </div>
          <div className="pager">
            <button className="button secondary" disabled={offset <= 0} onClick={() => load(Math.max(0, offset - pageSize), query)} type="button">Önceki</button>
            <button className="button secondary" disabled={offset + pageSize >= total} onClick={() => load(offset + pageSize, query)} type="button">Sonraki</button>
          </div>
        </div>
      </section>
    </div>
  );
}
