'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Geist } from 'next/font/google';
import { Activity, Bot, Home, LayoutTemplate, Settings, ShieldCheck } from 'lucide-react';
import styles from './dashboard-rail.module.css';

interface RailLink {
  label: string;
  href: string;
  icon: typeof Bot;
  active: boolean;
}

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

export function DashboardRail() {
  const pathname = usePathname() ?? '';
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  /* Pathname-only active rule: ?view=bots arrivals are redirected to
     /dashboard/bots by the home page, so the rail never reads search params
     (a search-param read would suspend the rail out of the first HTML). */
  const isBotsActive =
    pathname === '/dashboard/bots' ||
    pathname.startsWith('/dashboard/bots/') ||
    pathname.startsWith('/dashboard/new');
  const isHomeActive = pathname === '/dashboard';
  const isTemplatesActive = pathname === '/gallery' || pathname.startsWith('/gallery/');

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
      if (typeof window !== 'undefined') window.location.assign('/');
    } catch {
      setLogoutError('Çıkış yapılamadı. Lütfen tekrar dene.');
    } finally {
      setLoggingOut(false);
    }
  }

  /* Owner-language rail labels (Turkish). Copy-only: hrefs, icons and the
     pathname-only active rule above are unchanged. The `Primary` nav landmark
     stays English — the other nav on the product (`app/pryzm/page.tsx`) shares
     that landmark name, and a11y landmark names are not user copy. */
  const links: RailLink[] = [
    { label: 'Ana sayfa', href: '/dashboard', icon: Home, active: isHomeActive },
    { label: 'Botlar', href: '/dashboard/bots', icon: Bot, active: isBotsActive },
    { label: 'Şablonlar', href: '/gallery', icon: LayoutTemplate, active: isTemplatesActive },
    { label: 'Etkinlik', href: '/dashboard#week', icon: Activity, active: false },
    { label: 'Ön kontrol', href: '/dashboard#preflight', icon: ShieldCheck, active: false },
    { label: 'Ayarlar', href: '/dashboard#workspace', icon: Settings, active: false },
  ];

  return (
    <nav aria-label="Primary" className={`${geist.className} ${styles.rail}`}>
      <div className={styles.workspace}>
        <span aria-hidden="true" className={styles.avatar}>
          M
        </span>
        <span className={styles.workspaceName}>Sunucum</span>
      </div>
      <ul className={styles.navList}>
        {links.map((item) => (
          <li key={item.label}>
            <a
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={styles.navItem}
            >
              <span aria-hidden="true" className={styles.glyph}>
                <item.icon size={14} strokeWidth={2} />
              </span>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <div className={styles.railFoot}>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Yakında"
          className={styles.upgrade}
        >
          Yükselt · Yakında
        </button>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className={styles.upgrade}
        >
          {loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
        </button>
        {logoutError ? <p role="alert">{logoutError}</p> : null}
      </div>
    </nav>
  );
}
