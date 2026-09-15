import type { ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  title?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Card({ title, header, footer, children }: CardProps) {
  return (
    <section className={styles.card}>
      {header ??
        (title ? (
          <header className={styles.header}>
            <h3 className={styles.title}>{title}</h3>
          </header>
        ) : null)}
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}
