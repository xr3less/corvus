'use client';

// Client behaviors for the /pryzm route — a 1:1 port of the static clone's
// <script> block: lenis smooth scroll (guarded, native fallback), anchor
// offset, mobile menu, IO reveal, collage parallax, single-open FAQ, pricing
// toggle, demo forms. The markup stays in page.tsx (server); this only wires
// listeners. Everything is removed on unmount. Copy stays Pryzm-verbatim
// (interim — replacement is a later task).

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import styles from './pryzm.module.css';

const ANCHOR_OFFSET = 64;
const LOOP_OK = 'You are on the list — talk soon.';

// Lenis ships as a centrally installed npm dependency (`lenis`). The import
// stays dynamic so the module only loads in the browser effect; if it ever
// rejects at runtime the route falls back to native smooth scroll. Reduced
// motion always takes the native path.

type LenisInstance = {
  raf: (time: number) => void;
  scrollTo: (target: Element, options?: { offset?: number }) => void;
  destroy: () => void;
};

type LenisConstructor = new (options?: {
  duration?: number;
  smoothWheel?: boolean;
}) => LenisInstance;

function asLenisConstructor(value: unknown): LenisConstructor | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const ctor = (value as { default?: unknown }).default;
  if (typeof ctor !== 'function') {
    return null;
  }
  return ctor as LenisConstructor;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function nativeAnchorScroll(el: Element, smooth: boolean): void {
  const top = el.getBoundingClientRect().top + window.scrollY - ANCHOR_OFFSET;
  window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

export function PryzmEffects(): ReactElement | null {
  useEffect(() => {
    const removers: (() => void)[] = [];
    const on = (
      target: Window | Document | Element,
      type: string,
      listener: EventListener,
      options?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, listener, options);
      removers.push(() => {
        target.removeEventListener(type, listener, options);
      });
    };

    const reduced = prefersReducedMotion();
    let cancelled = false;
    let lenis: LenisInstance | null = null;
    let lenisFrame = 0;
    let parallaxFrame = 0;

    const canRaf =
      typeof window.requestAnimationFrame === 'function' &&
      typeof window.cancelAnimationFrame === 'function';

    // Lenis smooth scroll — guarded optional import, native fallback.
    // lenis is installed centrally by the orchestrator (see report).
    void (async () => {
      if (reduced) {
        return;
      }
      try {
        const lenisModule: unknown = await import('lenis');
        if (cancelled) {
          return;
        }
        const Lenis = asLenisConstructor(lenisModule);
        if (Lenis === null || !canRaf) {
          return;
        }
        lenis = new Lenis({ duration: 1.15, smoothWheel: true });
        const active: LenisInstance = lenis;
        const loop = (time: number): void => {
          if (cancelled) {
            return;
          }
          active.raf(time);
          lenisFrame = window.requestAnimationFrame(loop);
        };
        lenisFrame = window.requestAnimationFrame(loop);
      } catch {
        lenis = null;
      }
    })();

    // Anchor clicks ride lenis when present (fixed-header offset included).
    const anchors = Array.from(document.querySelectorAll('a[href^="#"]'));
    for (const anchor of anchors) {
      const handler = (event: Event): void => {
        const href = anchor.getAttribute('href');
        if (href === null || href.length < 2) {
          return;
        }
        const el = document.querySelector(href);
        if (el === null) {
          return;
        }
        event.preventDefault();
        if (lenis !== null) {
          lenis.scrollTo(el, { offset: -ANCHOR_OFFSET });
        } else {
          nativeAnchorScroll(el, !reduced);
        }
      };
      on(anchor, 'click', handler);
    }

    // Mobile menu (aria-expanded mirrors visibility).
    const menuBtn = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (menuBtn !== null && mobileMenu !== null) {
      const toggle = (): void => {
        const nowOpen = mobileMenu.classList.toggle(styles.mobileMenuOpen);
        menuBtn.setAttribute('aria-expanded', String(nowOpen));
      };
      on(menuBtn, 'click', toggle);
      const links = Array.from(mobileMenu.querySelectorAll('a'));
      for (const link of links) {
        const close = (): void => {
          mobileMenu.classList.remove(styles.mobileMenuOpen);
          menuBtn.setAttribute('aria-expanded', 'false');
        };
        on(link, 'click', close);
      }
    }

    // Reveal on scroll (quiet entrances, same threshold as the source).
    const revealEls = Array.from(document.querySelectorAll(`.${styles.reveal}`));
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add(styles.in);
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.08 },
      );
      for (const el of revealEls) {
        io.observe(el);
      }
      removers.push(() => {
        io.disconnect();
      });
    } else {
      for (const el of revealEls) {
        el.classList.add(styles.in);
      }
    }

    // Hero collage parallax — native scroll plus per-card drift speeds.
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-speed]'));
    if (!reduced && cards.length > 0) {
      const update = (): void => {
        const y = window.scrollY;
        for (const el of cards) {
          const speed = Number.parseFloat(el.dataset.speed ?? '0');
          el.style.transform = `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
        }
      };
      if (canRaf) {
        let queued = false;
        const onScroll = (): void => {
          if (!queued) {
            queued = true;
            parallaxFrame = window.requestAnimationFrame(() => {
              queued = false;
              update();
            });
          }
        };
        on(window, 'scroll', onScroll as EventListener, { passive: true });
        update();
      } else {
        update();
      }
    }

    // FAQ accordion (single-open).
    const faqItems = Array.from(document.querySelectorAll('[data-testid="faq-item"]'));
    for (const item of faqItems) {
      const button = item.querySelector('button');
      if (button === null) {
        continue;
      }
      const handler = (): void => {
        const wasOpen = item.getAttribute('data-open') === 'true';
        for (const other of faqItems) {
          other.setAttribute('data-open', 'false');
        }
        item.setAttribute('data-open', String(!wasOpen));
      };
      on(button, 'click', handler);
    }

    // Pricing toggle ($9 monthly <-> $81 yearly).
    const proPrice = document.getElementById('proPrice');
    const proPer = document.getElementById('proPer');
    const periodBtns = Array.from(document.querySelectorAll('[data-period]'));
    for (const btn of periodBtns) {
      const handler = (): void => {
        for (const other of periodBtns) {
          const active = other === btn;
          other.setAttribute('aria-pressed', String(active));
          other.classList.remove(styles.periodBtnActive, styles.periodBtnIdle);
          other.classList.add(active ? styles.periodBtnActive : styles.periodBtnIdle);
        }
        const yearly = btn.getAttribute('data-period') === 'year';
        if (proPrice !== null) {
          proPrice.textContent = yearly ? '$81' : '$9';
        }
        if (proPer !== null) {
          proPer.textContent = yearly ? 'per year' : 'per month';
        }
      };
      on(btn, 'click', handler);
    }

    // Newsletter (demo): loop form shows the ok message, footer form resets.
    const loopForm = document.getElementById('loopForm');
    const loopMsg = document.getElementById('loopMsg');
    if (loopForm !== null && loopForm instanceof HTMLFormElement) {
      const form: HTMLFormElement = loopForm;
      const handler = (event: Event): void => {
        event.preventDefault();
        if (loopMsg !== null) {
          loopMsg.textContent = LOOP_OK;
        }
        form.reset();
      };
      on(form, 'submit', handler);
    }
    const footForm = document.getElementById('footForm');
    if (footForm !== null && footForm instanceof HTMLFormElement) {
      const form: HTMLFormElement = footForm;
      const handler = (event: Event): void => {
        event.preventDefault();
        form.reset();
      };
      on(form, 'submit', handler);
    }

    return () => {
      cancelled = true;
      for (const remove of removers) {
        remove();
      }
      if (canRaf) {
        window.cancelAnimationFrame(lenisFrame);
        window.cancelAnimationFrame(parallaxFrame);
      }
      if (lenis !== null) {
        lenis.destroy();
        lenis = null;
      }
    };
  }, []);

  return null;
}
