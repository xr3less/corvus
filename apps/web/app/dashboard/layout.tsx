'use client';

import { Suspense } from 'react';
import { Geist } from 'next/font/google';
import { DashboardRail } from '@/components/ui/dashboard-rail';
import styles from './layout.module.css';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${geist.className} ${styles.shell}`}>
      <a href="#main-content" className={styles.skipLink}>
        İçeriğe geç
      </a>
      <Suspense>
        <DashboardRail />
      </Suspense>
      <main id="main-content" className={styles.content}>
        <div aria-hidden="true" className={styles.ambient}>
          <span className={styles.ambientGlowTop} />
          <span className={styles.ambientGlowBottom} />
        </div>
        {children}
      </main>
    </div>
  );
}
