/*
 * /pick/results — DEV-ONLY read-only view of the picker vote file.
 * Server component: reads the same `.pick-votes/votes.json` the vote route
 * writes. Never linked from prod navigation, never shipped.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { VARIANTS } from '../variants';
import '../pick.css';

export const dynamic = 'force-dynamic';

const VOTES_FILE = path.join(process.cwd(), '.pick-votes', 'votes.json');

type Votes = Record<string, number>;

async function readVotes(): Promise<Votes> {
  try {
    const raw = await readFile(VOTES_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const votes: Votes = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        votes[key] = Math.max(0, Math.floor(value));
      }
    }
    return votes;
  } catch {
    return {};
  }
}

export default async function PickResultsPage(): Promise<ReactElement> {
  const votes = await readVotes();
  const total = Object.values(votes).reduce((sum, value) => sum + value, 0);

  const rows = VARIANTS.map((variant) => ({
    id: variant.id,
    name: variant.name,
    origin: variant.origin,
    votes: votes[variant.id] ?? 0,
  })).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, 'tr'));

  const topVotes = rows.length > 0 ? rows[0].votes : 0;

  return (
    <main className="pick-root">
      <div className="pick-shell">
        <header className="pick-head">
          <div>
            <h1 className="pick-title">Sonuçlar — metin kutusu</h1>
            <p className="pick-sub">Sıralama en çok oy alandan aza doğru.</p>
          </div>
        </header>

        {total === 0 ? (
          <div className="pick-empty">
            <p className="pick-empty-line">Henüz oy yok — /pick sayfasından seç.</p>
            <Link href="/pick" className="pick-focus pick-results-link">
              Oylamaya git
            </Link>
          </div>
        ) : (
          <>
            <div className="pick-table-wrap">
              <table className="pick-table">
                <thead className="pick-table-head">
                  <tr>
                    <th className="pick-th">Stil</th>
                    <th className="pick-th">Kaynak</th>
                    <th className="pick-th pick-th-votes">Oy</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        row.votes === topVotes && topVotes > 0 ? 'pick-row-winner' : undefined
                      }
                    >
                      <td className="pick-td pick-td-name">{row.name}</td>
                      <td className="pick-td">
                        {row.origin === 'ours' ? 'bizim' : 'shadcn tarzı'}
                      </td>
                      <td className="pick-td pick-td-votes">{row.votes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pick-total">Toplam oy: {total}</p>
          </>
        )}

        <div className="pick-actions">
          <Link href="/pick" className="pick-focus pick-results-link">
            Geri dön
          </Link>
        </div>
      </div>
    </main>
  );
}
