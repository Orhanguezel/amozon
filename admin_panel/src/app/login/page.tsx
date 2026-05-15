'use client';

import { useState } from 'react';
import { BarChart2, User, Lock, ChevronRight } from 'lucide-react';
import { login } from '@/lib/auth';
import styles from './login.module.css';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={`${styles.orb} ${styles.orbTeal}`} />
      <div className={`${styles.orb} ${styles.orbBlue}`} />
      <div className={`${styles.orb} ${styles.orbGreen}`} />

      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <BarChart2 color="#fff" size={30} strokeWidth={2} />
          </div>
          <h1 className={styles.title}>Amozon</h1>
          <p className={styles.subtitle}>Amazon Ticari Radar — Yönetici Girişi</p>
        </div>

        <form action={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Kullanıcı Adı</label>
            <div className={styles.inputWrap}>
              <User className={styles.inputIcon} size={16} />
              <input
                className={styles.input}
                type="text"
                name="username"
                placeholder="admin"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Şifre</label>
            <div className={styles.inputWrap}>
              <Lock className={styles.inputIcon} size={16} />
              <input
                className={styles.input}
                type="password"
                name="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {error ? (
            <div className={styles.error}>{error}</div>
          ) : null}

          <button className={styles.btn} type="submit" disabled={pending}>
            {pending ? (
              <div className={styles.spinner} />
            ) : (
              <>
                Giriş Yap
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className={styles.footer}>
          <p className={styles.footerText}>Amozon · Amazon Ticari Radar</p>
        </div>
      </div>
    </div>
  );
}
