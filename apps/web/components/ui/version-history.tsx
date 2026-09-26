'use client';

import { useEffect, useState } from 'react';

export interface VersionHistoryItem {
  id: string;
  version: number;
  createdAt: string;
  isDraft: boolean;
  isProd: boolean;
}

export interface VersionHistoryProps {
  botId: string;
  onUndo: (versionId: string, versionNumber: number) => void;
}

function isVersionItem(value: unknown): value is VersionHistoryItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.version === 'number' &&
    typeof record.createdAt === 'string' &&
    typeof record.isDraft === 'boolean' &&
    typeof record.isProd === 'boolean'
  );
}

export function VersionHistory({ botId, onUndo }: VersionHistoryProps) {
  // null = not loaded yet (in-flight or failed). Fail-closed like the rail:
  // a down read renders no claim — never a crash, never fake rows. There is
  // no degraded-state sentence in the Wave 4 copy set, so failure renders the
  // heading only (same as loading), never the empty-state claim.
  const [versions, setVersions] = useState<VersionHistoryItem[] | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/bots/${encodeURIComponent(botId)}/versions`)
      .then(async (res): Promise<VersionHistoryItem[] | null> => {
        if (!res.ok) {
          return null;
        }
        const body: unknown = await res.json();
        if (typeof body !== 'object' || body === null) {
          return null;
        }
        const raw = (body as Record<string, unknown>).versions;
        if (!Array.isArray(raw) || !raw.every(isVersionItem)) {
          return null;
        }
        return raw;
      })
      .then((items) => {
        if (active && items !== null) {
          setVersions(items);
        }
      })
      .catch(() => {
        if (active) {
          setVersions(null);
        }
      });
    return () => {
      active = false;
    };
  }, [botId]);

  return (
    <section>
      <h2>Compare versions</h2>
      {versions !== null && versions.length === 0 && <p>No earlier version to undo to.</p>}
      {versions !== null && versions.length > 0 && (
        <>
          <ul>
            {versions.map((version) => (
              <li key={version.id}>
                <span>{version.createdAt}</span>
                <button type="button" onClick={() => onUndo(version.id, version.version)}>
                  Undo to previous version
                </button>
              </li>
            ))}
          </ul>
          <p>Undo keeps the current version for re-apply.</p>
        </>
      )}
    </section>
  );
}
