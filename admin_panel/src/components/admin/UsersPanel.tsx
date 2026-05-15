'use client';

import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, Save, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/integrations/admin-api';

type AdminUserRole = 'admin' | 'operator' | 'viewer';

type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  role: AdminUserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

const roleLabels: Record<AdminUserRole, string> = {
  admin: 'Yönetici',
  operator: 'Operatör',
  viewer: 'İzleyici',
};

const emptyDraft = {
  username: '',
  fullName: '',
  role: 'operator' as AdminUserRole,
  password: '',
};

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState({ username: '', fullName: '', role: 'operator' as AdminUserRole });
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeCount = useMemo(() => users.filter((user) => user.isActive).length, [users]);

  async function load() {
    const response = await apiGet<{ users: AdminUser[] }>('/api/users');
    setUsers(response.users);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : 'Kullanıcılar alınamadı.'));
  }, []);

  async function run(action: () => Promise<void>, fallback: string) {
    setLoading(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallback);
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    await run(async () => {
      await apiPost<AdminUser>('/api/users', draft);
      setDraft(emptyDraft);
      await load();
      setMessage('Kullanıcı oluşturuldu.');
    }, 'Kullanıcı oluşturulamadı.');
  }

  function beginEdit(user: AdminUser) {
    setEditingId(user.id);
    setEditing({ username: user.username, fullName: user.fullName, role: user.role });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditing({ username: '', fullName: '', role: 'operator' });
  }

  async function saveUser(userId: string) {
    await run(async () => {
      await apiPatch<AdminUser>(`/api/users/${userId}`, editing);
      cancelEdit();
      await load();
      setMessage('Kullanıcı bilgileri güncellendi.');
    }, 'Kullanıcı güncellenemedi.');
  }

  async function toggleActive(user: AdminUser) {
    await run(async () => {
      await apiPatch<AdminUser>(`/api/users/${user.id}`, { isActive: !user.isActive });
      await load();
      setMessage(user.isActive ? 'Kullanıcı pasifleştirildi.' : 'Kullanıcı aktifleştirildi.');
    }, 'Kullanıcı durumu güncellenemedi.');
  }

  async function changePassword(user: AdminUser) {
    const password = passwords[user.id] ?? '';
    await run(async () => {
      await apiPatch<AdminUser>(`/api/users/${user.id}`, { password });
      setPasswords((current) => ({ ...current, [user.id]: '' }));
      setMessage(`${user.username} için şifre güncellendi.`);
    }, 'Şifre güncellenemedi.');
  }

  async function removeUser(user: AdminUser) {
    await run(async () => {
      await apiDelete<{ ok: boolean }>(`/api/users/${user.id}`);
      await load();
      setMessage('Kullanıcı silindi.');
    }, 'Kullanıcı silinemedi.');
  }

  return (
    <>
      <section className="metrics">
        <div className="metric">
          <div className="metric-label">Toplam Kullanıcı</div>
          <div className="metric-value">{users.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Aktif Kullanıcı</div>
          <div className="metric-value">{activeCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Yönetici</div>
          <div className="metric-value">{users.filter((user) => user.role === 'admin').length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Son Giriş</div>
          <div className="metric-value user-small-metric">{formatDate(users.find((user) => user.lastLoginAt)?.lastLoginAt ?? null)}</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Yeni Kullanıcı</h2>
            <p className="muted">Panele giriş yapabilecek kullanıcı hesabı oluştur.</p>
          </div>
          <button className="button" disabled={loading} onClick={createUser} type="button">
            <Plus size={16} />
            Ekle
          </button>
        </div>
        <div className="panel-body">
          {message ? <p className={message.startsWith('API_ERROR') ? 'error' : 'muted'}>{message}</p> : null}
          <div className="user-form-grid">
            <label className="field">
              <span>Kullanıcı adı</span>
              <input className="input" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} placeholder="orhan" />
            </label>
            <label className="field">
              <span>Ad soyad</span>
              <input className="input" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} placeholder="Orhan Yönetici" />
            </label>
            <label className="field">
              <span>Rol</span>
              <select className="select" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminUserRole })}>
                {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Şifre</span>
              <input className="input" type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="En az 8 karakter" />
            </label>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Kullanıcı Listesi</h2>
            <p className="muted">Bilgi, durum ve şifre işlemlerini buradan yönet.</p>
          </div>
          <button className="button secondary" onClick={() => load()} type="button">
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kullanıcı</th>
                <th>Rol</th>
                <th>Durum</th>
                <th>Son giriş</th>
                <th>Şifre</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isEditing = editingId === user.id;
                return (
                  <tr key={user.id}>
                    <td>
                      {isEditing ? (
                        <div className="user-edit-grid">
                          <input className="input" value={editing.username} onChange={(event) => setEditing({ ...editing, username: event.target.value })} />
                          <input className="input" value={editing.fullName} onChange={(event) => setEditing({ ...editing, fullName: event.target.value })} />
                        </div>
                      ) : (
                        <div className="user-cell">
                          <strong>{user.fullName}</strong>
                          <span>{user.username}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select className="select" value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as AdminUserRole })}>
                          {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                        </select>
                      ) : roleLabels[user.role]}
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? 'done' : 'failed'}`}>{user.isActive ? 'Aktif' : 'Pasif'}</span>
                    </td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      <div className="password-change">
                        <input
                          className="input"
                          type="password"
                          value={passwords[user.id] ?? ''}
                          onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))}
                          placeholder="Yeni şifre"
                        />
                        <button className="icon-button" disabled={loading || !(passwords[user.id] ?? '').trim()} onClick={() => changePassword(user)} title="Şifreyi değiştir" type="button">
                          <KeyRound size={16} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        {isEditing ? (
                          <>
                            <button className="icon-button" disabled={loading} onClick={() => saveUser(user.id)} title="Kaydet" type="button"><Save size={16} /></button>
                            <button className="icon-button" disabled={loading} onClick={cancelEdit} title="Vazgeç" type="button"><X size={16} /></button>
                          </>
                        ) : (
                          <>
                            <button className="icon-button" disabled={loading} onClick={() => beginEdit(user)} title="Düzenle" type="button"><Pencil size={16} /></button>
                            <button className="icon-button" disabled={loading} onClick={() => toggleActive(user)} title={user.isActive ? 'Pasifleştir' : 'Aktifleştir'} type="button">
                              {user.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                            </button>
                            <button className="icon-button danger" disabled={loading} onClick={() => removeUser(user)} title="Sil" type="button"><Trash2 size={16} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!users.length ? (
                <tr>
                  <td colSpan={6}>Kullanıcı bulunamadı.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
