'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImageIcon, MessageSquarePlus, Paperclip, RefreshCw, Send, Trash2, Upload } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '@/integrations/admin-api';

type NotePriority = 'low' | 'normal' | 'high' | 'critical';
type NoteStatus = 'open' | 'reviewing' | 'resolved' | 'archived';

type DeveloperNote = {
  id: string;
  subject: string;
  body: string;
  priority: NotePriority;
  status: NoteStatus;
  page_path: string | null;
  attachment_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const priorityLabels: Record<NotePriority, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  critical: 'Kritik',
};

const statusLabels: Record<NoteStatus, string> = {
  open: 'Açık',
  reviewing: 'İnceleniyor',
  resolved: 'Çözüldü',
  archived: 'Arşiv',
};

function noteBadgeClass(value: string) {
  if (value === 'critical') return 'failed';
  if (value === 'high') return 'dikkatli_ol';
  if (value === 'resolved') return 'done';
  if (value === 'reviewing') return 'running';
  return 'pending';
}

export function DeveloperNotesPanel() {
  const [notes, setNotes] = useState<DeveloperNote[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [pagePath, setPagePath] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [priority, setPriority] = useState<NotePriority>('normal');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function loadNotes() {
    setLoading(true);
    try {
      const result = await apiGet<{ notes: DeveloperNote[] }>('/api/developer-notes?limit=100');
      setNotes(result.notes);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Notlar alınamadı');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotes().catch(() => undefined);
  }, []);

  const highPriorityCount = useMemo(
    () => notes.filter((note) => note.priority === 'high' || note.priority === 'critical').length,
    [notes],
  );

  async function createNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setMessage('Konu ve not zorunlu.');
      return;
    }

    try {
      await apiPost<DeveloperNote>('/api/developer-notes', {
        subject,
        body,
        priority,
        page_path: pagePath,
        attachment_url: attachmentUrl,
        created_by: createdBy,
      });
      setSubject('');
      setBody('');
      setCreatedBy('');
      setPagePath('');
      setAttachmentUrl('');
      setPriority('normal');
      setMessage('Yazılımcı notu kaydedildi.');
      await loadNotes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Not kaydedilemedi');
    }
  }

  async function updateStatus(id: string, status: NoteStatus) {
    try {
      await apiPatch<{ ok: boolean }>(`/api/developer-notes/${id}`, { status });
      await loadNotes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Not güncellenemedi');
    }
  }

  async function deleteNote(id: string) {
    try {
      await apiDelete<{ ok: boolean }>(`/api/developer-notes/${id}`);
      setMessage('Not silindi.');
      await loadNotes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Not silinemedi');
    }
  }

  async function uploadImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const upload = await apiUpload<{ url: string }>('/api/uploads', file);
      setAttachmentUrl(upload.url);
      setMessage('Resim yüklendi ve nota eklendi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Resim yüklenemedi');
    } finally {
      setUploading(false);
    }
  }

  function isImageUrl(url: string | null) {
    return Boolean(url && /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url));
  }

  function assetUrl(url: string | null) {
    if (!url) return '';
    if (url.startsWith('/api/')) return `${process.env.NEXT_PUBLIC_BASE_PATH || ''}${url}`;
    return url;
  }

  return (
    <div className="content">
      <section className="metrics">
        <div className="metric">
          <span className="metric-label">Toplam Not</span>
          <div className="metric-value">{notes.length}</div>
        </div>
        <div className="metric">
          <span className="metric-label">Yüksek Öncelik</span>
          <div className="metric-value">{highPriorityCount}</div>
        </div>
        <div className="metric">
          <span className="metric-label">Kayıt Tablosu</span>
          <div className="metric-value">DB</div>
        </div>
        <div className="metric">
          <span className="metric-label">Durum</span>
          <div className="metric-value">{loading ? '...' : 'Hazır'}</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Yazılımcı Notu</h2>
            <p className="muted">Kullanıcı buraya istek, hata, ekran notu veya öncelikli aksiyon yazabilir. Kayıtlar `amazon_developer_notes` tablosuna düşer.</p>
          </div>
          <button className="button secondary" type="button" onClick={() => loadNotes()}>
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
        <div className="panel-body">
          <form className="note-form" onSubmit={createNote}>
            <label className="field">
              <span>Konu</span>
              <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Örn. Ürünler sayfasında grafik eksik" />
            </label>
            <label className="field">
              <span>Yazan</span>
              <input className="input" value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder="İsim veya firma" />
            </label>
            <label className="field">
              <span>Sayfa</span>
              <input className="input" value={pagePath} onChange={(event) => setPagePath(event.target.value)} placeholder="/products, /scans, /settings..." />
            </label>
            <label className="field">
              <span>Öncelik</span>
              <select className="select" value={priority} onChange={(event) => setPriority(event.target.value as NotePriority)}>
                <option value="low">Düşük</option>
                <option value="normal">Normal</option>
                <option value="high">Yüksek</option>
                <option value="critical">Kritik</option>
              </select>
            </label>
            <label className="field note-form-wide">
              <span>Dosya / ekran görüntüsü linki</span>
              <input className="input" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="https://..." />
            </label>
            <label className="field note-form-wide">
              <span>Resim Yükle</span>
              <div className="upload-row">
                <input
                  className="input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => uploadImage(event.target.files?.[0] ?? null)}
                />
                <span className="muted">{uploading ? 'Yükleniyor...' : 'PNG, JPG, WEBP veya GIF. Maksimum 6 MB.'}</span>
              </div>
            </label>
            {attachmentUrl && isImageUrl(attachmentUrl) ? (
              <div className="note-upload-preview note-form-wide">
                <ImageIcon size={16} />
                <img src={assetUrl(attachmentUrl)} alt="Yüklenecek not görseli" />
              </div>
            ) : null}
            <label className="field note-form-wide">
              <span>Not</span>
              <textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Sorunu, isteği veya beklenen davranışı yazın." />
            </label>
            <div className="note-form-actions">
              {message ? <span className="muted">{message}</span> : <span />}
              <button className="button" type="submit">
                <Send size={16} />
                Kaydet
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Not Geçmişi</h2>
            <p className="muted">En yeni notlar üstte görünür. Çözüldü işaretlenen kayıt DB’de kalır.</p>
          </div>
        </div>
        <div className="panel-body note-list">
          {!notes.length ? (
            <p className="muted">Henüz yazılımcı notu yok.</p>
          ) : notes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-card-header">
                <div>
                  <h3>{note.subject}</h3>
                  <p>
                    {new Date(note.created_at).toLocaleString('tr-TR')}
                    {note.created_by ? ` · ${note.created_by}` : ''}
                    {note.page_path ? ` · ${note.page_path}` : ''}
                  </p>
                </div>
                <div className="note-badges">
                  <span className={`badge ${noteBadgeClass(note.priority)}`}>{priorityLabels[note.priority] || note.priority}</span>
                  <span className={`badge ${noteBadgeClass(note.status)}`}>{statusLabels[note.status] || note.status}</span>
                </div>
              </div>
              <p className="note-body">{note.body}</p>
              <div className="note-actions">
                {note.attachment_url ? (
                  isImageUrl(note.attachment_url) ? (
                    <a className="note-image-link" href={assetUrl(note.attachment_url)} target="_blank" rel="noreferrer">
                      <img src={assetUrl(note.attachment_url)} alt={`${note.subject} ekran görüntüsü`} />
                    </a>
                  ) : (
                    <a className="button secondary" href={assetUrl(note.attachment_url)} target="_blank" rel="noreferrer">
                      <Paperclip size={16} />
                      Eki Aç
                    </a>
                  )
                ) : null}
                <label className="button secondary">
                  <Upload size={16} />
                  Resim Ekle
                  <input
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={async (event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (!file) return;
                      setUploading(true);
                      try {
                        const upload = await apiUpload<{ url: string }>('/api/uploads', file);
                        await apiPatch<{ ok: boolean }>(`/api/developer-notes/${note.id}`, { attachment_url: upload.url });
                        await loadNotes();
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : 'Resim eklenemedi');
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
                <button className="button secondary" type="button" onClick={() => updateStatus(note.id, 'reviewing')}>
                  <MessageSquarePlus size={16} />
                  İnceleniyor
                </button>
                <button className="button secondary" type="button" onClick={() => updateStatus(note.id, 'resolved')}>
                  <CheckCircle2 size={16} />
                  Çözüldü
                </button>
                <button className="icon-button danger" type="button" onClick={() => deleteNote(note.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
