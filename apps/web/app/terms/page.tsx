import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Terms of Service - Corvus',
  description:
    'The plain-English rules for using Corvus: your trial, your plan, acceptable use, and how to leave.',
};

const SUPPORT_EMAIL = 'support@corvus.ai';

export default function TermsOfServicePage() {
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
          <h1 className={styles.title}>Terms of service</h1>
          <p className={styles.updated}>Last updated 15 September 2026</p>
        </header>

        <p className={styles.intro}>
          These are the rules for using Corvus. We have kept them short and in plain words. By
          creating an account or using the service, you agree to them. If anything here is unclear,
          email us at{' '}
          <a className={styles.link} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <div className={styles.body}>
          <section className={styles.section}>
            <h2 className={styles.h2}>The short version</h2>
            <ul className={styles.list}>
              <li>Corvus builds and runs a Discord bot from your plain-English description.</li>
              <li>
                Billing isn&apos;t live yet. A 3-day trial of Pro features, limited to one bot and
                100 AI credits with no card required, is planned. When plans ship, your bot naps
                when a plan ends and you can upgrade whenever you want.
              </li>
              <li>You are responsible for what your bot does in your server.</li>
              <li>You can leave whenever you want and take your data with you.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Who can use Corvus</h2>
            <ul className={styles.list}>
              <li>
                You need a Discord account, and you must be allowed to manage the servers you
                connect.
              </li>
              <li>
                You must follow Discord&rsquo;s own rules as well as these ones, and the law where
                you live.
              </li>
              <li>
                If you are not old enough to agree to these terms where you live, a parent or
                guardian must agree for you.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Your account and your servers</h2>
            <p className={styles.p}>
              You sign in through Discord. Keep access to that Discord account safe, because anyone
              who has it can manage your bots. You decide which servers to connect and what your bot
              is allowed to do, and you can disconnect a server at any time.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Plans, trial, and billing</h2>
            <p className={styles.p}>
              Payments aren&apos;t live yet — there is no checkout, no charges, no refill packs, and
              no dashboard cancel, because there is nothing to cancel. Below is what we intend to
              sell:
            </p>
            <ul className={styles.list}>
              <li>
                <span className={styles.strong}>Trial (live):</span> 3 days of Pro features, limited
                to one bot and 100 AI credits, no card required.
              </li>
              <li>
                <span className={styles.strong}>Planned: Paid plans:</span> Pro is $10 a month and
                Studio is $29 a month. Prices are in US dollars.
              </li>
              <li>
                <span className={styles.strong}>Planned: Credits:</span> paid plans include AI
                credits, which pay for building bots and writing smart replies. Everyday jobs such
                as roles, commands, and XP never use credits. A $5 refill pack of 1,000 credits,
                valid for 90 days, is planned.
              </li>
              <li>
                <span className={styles.strong}>Planned: When a plan lapses:</span> your bot naps.
                Nothing is deleted. We keep your data for 12 months, and your bot wakes up the
                moment you upgrade.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Acceptable use</h2>
            <ul className={styles.list}>
              <li>
                Do not use Corvus to break the law, harass people, or break Discord&rsquo;s rules.
              </li>
              <li>
                Do not use it to send spam, run scams, or collect personal data you have no right to
                hold.
              </li>
              <li>Do not try to break, overload, or copy the service.</li>
              <li>
                We can suspend an account that puts other people or the service at risk, and we will
                tell you why.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Your content and your bot</h2>
            <ul className={styles.list}>
              <li>
                You own your server, its data, and the bot setup you create. We store it only to run
                your bot for you.
              </li>
              <li>
                You give us permission to host, run, and back up what you give us, so we can provide
                the service.
              </li>
              <li>
                You are responsible for making sure your bot follows Discord&rsquo;s rules and the
                law where your members live.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>How the service runs</h2>
            <p className={styles.p}>
              We work to keep Corvus online and your bot running, and we test changes on a practice
              server before they reach yours. We do not promise the service will never be
              unavailable, and we are not responsible for Discord going down or changing its rules.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Ending your account</h2>
            <ul className={styles.list}>
              <li>
                You can delete your account from your dashboard at any time. We remove your data as
                described in the privacy policy.
              </li>
              <li>
                If we end your access for breaking these terms, we will tell you which rule was
                broken.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Changes to these terms</h2>
            <p className={styles.p}>
              We may update these terms. When we do, we change the date at the top of this page. If
              a change is significant, we will also tell you inside your dashboard.
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
