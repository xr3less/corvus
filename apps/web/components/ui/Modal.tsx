'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './Modal.module.css';

export interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  confirmLabel?: string;
  onConfirm?: () => void;
  /** When set, the confirm button stays disabled until this exact phrase is typed. */
  confirmPhrase?: string;
  tone?: 'default' | 'danger';
}

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  children,
  onClose,
  confirmLabel,
  onConfirm,
  confirmPhrase,
  tone = 'default',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState('');
  const confirmed = confirmPhrase === undefined || typed === confirmPhrase;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || dialog === null) {
        return;
      }
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="modal-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`${styles.dialog} ${tone === 'danger' ? styles.danger : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.body}>{children}</div>
        {confirmPhrase !== undefined ? (
          <div className={styles.confirmBlock}>
            <label className={styles.confirmLabel} htmlFor="modal-confirm-phrase">
              Type {confirmPhrase} to confirm
            </label>
            <input
              id="modal-confirm-phrase"
              className={styles.confirmInput}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {confirmLabel ? (
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={!confirmed}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
