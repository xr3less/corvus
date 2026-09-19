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
      setLogoutError('Could not log out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }

  const links: RailLink[] = [
    { label: 'Home', href: '/dashboard', icon: Home, active: isHomeActive },
    { label: 'Bots', href: '/dashboard/bots', icon: Bot, active: isBotsActive },
    { label: 'Templates', href: '/gallery', icon: LayoutTemplate, active: isTemplatesActive },
    { label: 'Activity', href: '/dashboard#week', icon: Activity, active: false },
    { label: 'Pre-flight', href: '/dashboard#preflight', icon: ShieldCheck, active: false },
    { label: 'Settings', href: '/dashboard#workspace', icon: Settings, active: false },
  ];

  return (
    <nav aria-label="Primary" className={`${geist.className} ${styles.rail}`}>
      <div className={styles.workspace}>
        <span aria-hidden="true" className={styles.avatar}>
          M
        </span>
        <span className={styles.workspaceName}>My server</span>
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
          title="Coming soon"
          className={styles.upgrade}
        >
          Upgrade · Coming soon
        </button>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className={styles.upgrade}
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
        {logoutError ? <p role="alert">{logoutError}</p> : null}
      </div>
    </nav>
  );
}
