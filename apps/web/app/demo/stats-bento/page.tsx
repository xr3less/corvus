import { notFound } from 'next/navigation';
import StatsBentoDemo from '@/components/ui/stats-bento-demo';

export const metadata = {
  title: 'Stats Bento Demo — Corvus',
  description: 'Interactive stats bento grid component demo',
};

export default function StatsBentoDemoPage() {
  // Parked route (KI-034): direct URLs 404 in production; dev is untouched.
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <StatsBentoDemo />;
}
