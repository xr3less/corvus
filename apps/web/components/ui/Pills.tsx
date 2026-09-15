import styles from './Pills.module.css';

export type PillStatus = 'online' | 'offline' | 'trial';

const STATUS_LABEL: Record<PillStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  trial: 'Trial',
};

export function Pill({ status }: { status: PillStatus }) {
  return (
    <span className={`${styles.pill} ${styles[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export type RowTone = 'red' | 'yellow' | 'green';

export interface StatusRowProps {
  tone: RowTone;
  label: string;
  detail: string;
}

export function StatusRow({ tone, label, detail }: StatusRowProps) {
  return (
    <div className={`${styles.row} ${styles[`row-${tone}`]}`}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowDetail}>{detail}</span>
    </div>
  );
}
