'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Geist } from 'next/font/google';
import { Activity, Bot, Home, LayoutTemplate, Settings, ShieldCheck } from 'lucide-react';
import {
  deleteConversation,
  listConversations,
  type ConversationListItem,
} from '@/lib/conversations/client';
import { ensureConversationForBot, rehydrateThread } from '@/lib/chat/thread';
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
  /* Conversation list (Wave 1): newest-first rows from GET /api/conversations.
     Fail-closed: a down history read settles to `ok:false` and the section
     renders its honest empty/degraded state — never a crash, never fake rows.
     `listLoaded` gates the empty state like the bots list does: an in-flight
     fetch renders no claim, only a resolved read may say the account is empty.
     Thread helpers are consumed, never reimplemented: `listConversations` /
     `deleteConversation` for list/delete, `ensureConversationForBot` for a new
     chat, `rehydrateThread` to verify an opened row still exists. The rail owns
     no thread surface, so rehydrated rows are discarded — rendering them belongs
     to the page wiring (Wave 4 owns page.tsx). `persistThreadTurns` has no rail
     role (the rail holds no thread rows) and is deliberately not called. */
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const requestSeq = useRef(0);
  /* Pathname-only active rule: ?view=bots arrivals are redirected to
     /dashboard/bots by the home page, so the rail never reads search params
     (a search-param read would suspend the rail out of the first HTML). */
  const isBotsActive =
    pathname === '/dashboard/bots' ||
    pathname.startsWith('/dashboard/bots/') ||
    pathname.startsWith('/dashboard/new');
  const isHomeActive = pathname === '/dashboard';
  const isTemplatesActive = pathname === '/gallery' || pathname.startsWith('/gallery/');

  useEffect(() => {
    requestSeq.current += 1;
    const seq = requestSeq.current;
    let active = true;
    void listConversations().then((result) => {
      if (!active || requestSeq.current !== seq) return;
      if (result.ok) {
        setConversations(result.conversations);
        setListNotice(null);
      } else {
        setConversations([]);
        setListNotice(result.notice);
      }
      setListLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

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

  /* A new chat opens one account-level conversation (botId null — the rail
     names no bot), marks it active, and refreshes the list so the newest-first
     order is the server's, not a local guess. Fail-closed: a down history
     read shows the single honest notice and keeps whatever list is on screen. */
  async function handleNewChat() {
    if (creating) return;
    setCreating(true);
    try {
      const opened = await ensureConversationForBot(null);
      if (!opened.ok) {
        setListNotice(opened.notice);
        return;
      }
      setActiveConversationId(opened.conversationId);
      setConfirmDeleteId(null);
      const listed = await listConversations();
      if (listed.ok) {
        setConversations(listed.conversations);
        setListNotice(null);
      } else {
        setListNotice(listed.notice);
      }
      setListLoaded(true);
    } finally {
      setCreating(false);
    }
  }

  /* Open verifies the row still exists through the landed rehydrate helper —
     a 404-class read surfaces the honest notice instead of a dead selection. */
  async function handleOpen(id: string) {
    if (busyId !== null) return;
    setBusyId(id);
    try {
      const loaded = await rehydrateThread(id);
      if (!loaded.ok) {
        setListNotice(loaded.notice);
        return;
      }
      setListNotice(null);
      setActiveConversationId(id);
    } finally {
      setBusyId(null);
    }
  }

  /* Delete is two-step with no new copy: the first click arms the row's own
     `Sohbeti sil` button, the second performs it. A failed delete keeps the
     local entry — a failed delete must never read as a confirmed one. */
  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    if (busyId !== null) return;
    setBusyId(id);
    try {
      const removed = await deleteConversation(id);
      if (!removed.ok) {
        setListNotice(removed.notice);
        return;
      }
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (activeConversationId === id) setActiveConversationId(null);
      setConfirmDeleteId(null);
      setListNotice(null);
    } finally {
      setBusyId(null);
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
      {/* Conversation history: divs, never list/link roles, so the six-link
         nav list above keeps its locked shape for its pinned tests. Row titles
         fall back to the row's updatedAt (server data, never invented copy);
         every other visible word is one of the five allowed Turkish strings or
         the single allowed down-path notice. */}
      <section aria-label="Sohbetler">
        <h2 className={styles.workspaceName}>Sohbetler</h2>
        <button
          type="button"
          onClick={() => void handleNewChat()}
          disabled={creating}
          className={styles.upgrade}
        >
          Yeni sohbet başlat
        </button>
        {listLoaded ? (
          conversations.length === 0 ? (
            <p className={styles.workspaceName}>Eski sohbet yok</p>
          ) : (
            <div>
              {conversations.map((item) => (
                <div key={item.id}>
                  <span className={styles.workspaceName}>{item.title ?? item.updatedAt}</span>
                  <button
                    type="button"
                    onClick={() => void handleOpen(item.id)}
                    disabled={busyId !== null}
                    aria-current={activeConversationId === item.id ? 'true' : undefined}
                    className={styles.navItem}
                  >
                    Sohbet aç
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    disabled={busyId !== null}
                    aria-expanded={confirmDeleteId === item.id}
                    className={styles.upgrade}
                  >
                    Sohbeti sil
                  </button>
                </div>
              ))}
            </div>
          )
        ) : null}
        {listNotice !== null ? <p role="status">{listNotice}</p> : null}
      </section>
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
