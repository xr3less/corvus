import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import './globals.css';

const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Corvus — Sade Dille Discord Botu Kur',
  description:
    'Corvus, Discord toplulukları için kod yazmadan bot kurma aracı: botunu sade bir dille anlat, taslağını gör ve canlıya almadan önce test et. Ücretsiz 3 günlük deneme — kart gerekmez.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={publicSans.variable}>
      <body className={publicSans.className}>{children}</body>
    </html>
  );
}
