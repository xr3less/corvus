import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy - Corvus',
  description:
    'What Corvus keeps, what it never keeps, who else handles your data, and how to see or delete it.',
};

const SUPPORT_EMAIL = 'support@corvus.ai';

export default function PrivacyPolicyPage() {
  return (
    <div className={styles.page}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>

      <main id="main-content" className={styles.shell}>
        <header className={styles.head}>
          <a href="/" className={styles.brand} aria-label="Corvus home">
            CORVUS
          </a>
          <h1 className={styles.title}>Privacy policy</h1>
          <p className={styles.updated}>Last updated 15 September 2026</p>
        </header>

        <p className={styles.intro}>
          This page explains, in plain words, what Corvus keeps about you and your Discord server,
          why we keep it, and how you can see it or remove it. If anything here is unclear, email us
          at{' '}
          <a className={styles.link} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{' '}
          and we will explain it.
        </p>

        <div className={styles.body}>
          <section className={styles.section}>
            <h2 className={styles.h2}>The short version</h2>
            <ul className={styles.list}>
              <li>We keep only what we need to build, run, and bill for your bot.</li>
              <li>We never store your Discord password or your card details.</li>
              <li>Your bot token is encrypted, and unlocked only to run your bot.</li>
              <li>You can see, export, or delete your data from your dashboard.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>What we keep</h2>
            <ul className={styles.list}>
              <li>
                <span className={styles.strong}>Your Discord account ID</span> and the IDs of the
                servers you connect, so we know which bots belong to you.
              </li>
              <li>
                <span className={styles.strong}>Your bot settings</span> — the plain-English
                instructions you give us and the bot setup that comes out of them.
              </li>
              <li>
                <span className={styles.strong}>Member history your bot tracks</span> — XP, levels,
                roles, and warnings — so nothing is lost when your bot restarts.
              </li>
              <li>
                <span className={styles.strong}>Your plan and credit balance</span>, so your account
                and usage add up.
              </li>
              <li>
                <span className={styles.strong}>Your email address</span>, if you add one, for
                account recovery and billing messages.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>What we never keep</h2>
            <ul className={styles.list}>
              <li>
                <span className={styles.strong}>No card numbers.</span> Payments will run through
                Creem when billing ships — it isn&apos;t live yet. When it does, Creem will take the
                payment and hold your card details, so your card never reaches us.
              </li>
              <li>
                <span className={styles.strong}>No Discord password.</span> You sign in through
                Discord, so there is no password for us to lose.
              </li>
              <li>
                <span className={styles.strong}>No member message content by default.</span> We keep
                messages only when a bot feature you switched on needs them, only for as long as
                that feature needs them, and only per server. You can switch it off for any server
                from your dashboard.
              </li>
              <li>
                <span className={styles.strong}>No bot tokens in our logs.</span>
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Your bot token</h2>
            <p className={styles.p}>
              When you connect a bot, its token is encrypted before it is saved. Only the part of
              our system that runs your bot can unlock it. It never appears in our logs, and it is
              never shown back to you or to our team in the dashboard.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Who else handles your data</h2>
            <p className={styles.p}>We keep this list short and specific:</p>
            <ul className={styles.list}>
              <li>
                <span className={styles.strong}>Contabo and Hetzner</span> — the hosting companies
                that run the machines your data sits on. For V1, this is inside the European Union.
              </li>
              <li>
                <span className={styles.strong}>Creem</span> — Payments will run through Creem when
                billing ships — it isn&apos;t live yet. When it does, Creem will take your payment,
                hold your card details, and handle invoices, refunds, and chargebacks.
              </li>
              <li>
                <span className={styles.strong}>The AI services we use</span> — they receive only
                the instructions and text needed to build your bot or write one of its auto-replies.
                They do not receive your card details.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>How long we keep it</h2>
            <ul className={styles.list}>
              <li>
                While your account is active, we keep your setup and history so your bot keeps
                working.
              </li>
              <li>
                If your trial ends or a paid plan lapses, your bot naps instead of being deleted. We
                keep your data for 12 months, and everything wakes up the moment you upgrade.
              </li>
              <li>
                If you delete your account, we remove your data. Short backup cycles can delay the
                final removal, and we will say so if that applies to you.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Your choices</h2>
            <ul className={styles.list}>
              <li>
                <span className={styles.strong}>See and export.</span> From your dashboard you can
                download your bot setup and history.
              </li>
              <li>
                <span className={styles.strong}>Correct.</span> Edit or delete anything your bot
                stores from the dashboard.
              </li>
              <li>
                <span className={styles.strong}>Delete.</span> You can delete your account and its
                data from your dashboard.
              </li>
              <li>
                <span className={styles.strong}>Ask us.</span> Email{' '}
                <a className={styles.link} href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>{' '}
                and we will help. We aim to reply within 3 business days.
              </li>
            </ul>
            <div className={styles.actions}>
              <a className={styles.button} href="/dashboard">
                Open your dashboard
              </a>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>If something goes wrong</h2>
            <p className={styles.callout}>
              If a security incident ever puts your data at risk, we will tell the affected account
              owners within 72 hours of confirming it, explain what happened in plain words, and
              tell you what to do next.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Changes to this policy</h2>
            <p className={styles.p}>
              If we change how we handle your data, we update this page and change the date at the
              top. If the change is significant, we will also tell you inside your dashboard.
            </p>
          </section>
        </div>

        <footer className={styles.footer}>
          <a className={styles.footerLink} href="/privacy">
            Privacy policy
          </a>
          <a className={styles.footerLink} href="/terms">
            Terms of service
          </a>
          <a className={styles.footerLink} href="/">
            Back to home
          </a>
        </footer>
      </main>
    </div>
  );
}
