'use client';

/* Plan approval card (Wave 4 approval slice): one-click owner approval routed
   through the page's own submit path. This component owns NO network and NO
   verdict logic — the Onayla button calls the `onApprove` prop ONLY (the page
   wiring slice passes a wrapper around `handleSubmit` with the canned approval
   word, so mint-once + verdict once-guards apply unchanged). Rendered by the
   page on plan arrival; mounting/unmounting is the page's decision, not this
   component's. Only the four wave-4 approval strings appear here, byte-exact. */

import styles from './plan-approval-card.module.css';

export interface PlanApprovalCardProps {
  onApprove: () => void;
  approving: boolean;
}

export function PlanApprovalCard({ onApprove, approving }: PlanApprovalCardProps) {
  return (
    <section aria-labelledby="plan-approval-title" className={styles.card}>
      <p id="plan-approval-title" className={styles.title}>
        Plan hazır — doğru görünüyor mu?
      </p>
      <button type="button" onClick={onApprove} disabled={approving} className={styles.approve}>
        {approving ? 'Onayın gönderiliyor…' : 'Planı onayla ve kurulumu başlat'}
      </button>
      <p className={styles.hint}>Değişiklik istersen yazman yeterli.</p>
    </section>
  );
}
