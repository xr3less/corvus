'use client';

import { Button } from './Button';
import styles from './DiffView.module.css';

export type DiffKind = 'added' | 'removed' | 'changed';

export interface DiffChange {
  id: string;
  kind: DiffKind;
  title: string;
  before?: string;
  after?: string;
}

export interface DiffViewProps {
  changes: DiffChange[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

const KIND_LABEL: Record<DiffKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
};

export function DiffView({ changes, onAccept, onReject }: DiffViewProps) {
  return (
    <ul className={styles.list}>
      {changes.map((change) => (
        <li key={change.id} className={`${styles.item} ${styles[change.kind]}`}>
          <div className={styles.main}>
            <span className={styles.kind}>{KIND_LABEL[change.kind]}</span>
            <span className={styles.title}>{change.title}</span>
            {change.before !== undefined ? (
              <code className={styles.before}>{change.before}</code>
            ) : null}
            {change.after !== undefined ? (
              <code className={styles.after}>{change.after}</code>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button
              variant="ghost"
              aria-label={`Reject ${change.title}`}
              onClick={() => onReject(change.id)}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              aria-label={`Accept ${change.title}`}
              onClick={() => onAccept(change.id)}
            >
              Accept
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
