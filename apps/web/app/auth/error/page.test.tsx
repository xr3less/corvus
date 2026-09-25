/* Tests for the sign-in failure page.
 *
 * The failure this page closes: every auth failure redirects to
 * `?error=<code>` and nothing read the parameter, so a failed sign-in looked
 * exactly like a successful one. What these tests pin:
 *
 *  1. a known code produces its own sentence, and a code we do not know
 *     produces the generic sentence rather than the raw value;
 *  2. an attacker-supplied value can never become page content (the XSS probe);
 *  3. the page always offers the one link that restarts sign-in;
 *  4. no jargon or system name from the design language's forbidden list (L-015)
 *     reaches the user's screen.
 *
 * The page is an async Server Component. On a client the React 19 reconciler
 * still resolves a thenable returned by a component (`unwrapThenable` in
 * `react-dom-client`, engaged when `typeof newChild.then === 'function'`), so
 * `render(await AuthErrorPage({ searchParams }))` exercises the real
 * `await searchParams` read — the loader only ever supplies the Promise shape
 * that Next itself supplies at request time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthErrorPage from './page';

const LOGIN_HREF = '/api/auth/login';

/* The design language's non-coder voice list (Docs/04_design_language.md §6,
   L-015): at 50-5,000 member Discord servers the owner is not a developer, so
   none of these may appear on a user-facing screen. The list is deliberately
   narrow — terms that would be legitimate elsewhere ("server", "account") are
   not here, so a failure is a real leak, not a false alarm. */
const FORBIDDEN = [
  'OAuth',
  'PKCE',
  'ACID',
  'Postgres',
  'WebSocket',
  'Multi-guild',
  'Dispatch',
  'Compilation',
  'Self-healing',
  'Behavior spec',
  'Sandbox',
  'Backend',
  'API',
  'Production-grade',
  'Built from first principles',
  'Enterprise-Grade',
  'Architectural Breakthroughs',
  'token',
  'callback',
  'state parameter',
  'server log',
];

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

/* Next hands a page `searchParams` as a Promise; the test builds the same. */
function renderErrorPage(error?: string | string[]): Promise<void> {
  return AuthErrorPage({ searchParams: Promise.resolve({ error }) }).then((page) => {
    render(page);
  });
}

function expectNoForbiddenJargon(): void {
  const text = (document.body.textContent ?? '').toLowerCase();
  for (const term of FORBIDDEN) {
    expect(text, `forbidden term shipped: ${term}`).not.toContain(term.toLowerCase());
  }
}

function expectRetryLink(): void {
  const link = screen.getByRole('link', { name: 'Try signing in again' });
  expect(link.getAttribute('href')).toBe(LOGIN_HREF);
}

describe('sign-in failure page', () => {
  it('shows its own sentence for a known code', async () => {
    await renderErrorPage('login_unavailable');

    expect(screen.getByRole('heading').textContent).toBe('Sign-in is not available right now.');
    expect(
      screen.getByText(
        'Nothing is wrong with your account. The sign-in step is briefly unavailable, so try it again in a moment.',
      ),
    ).toBeTruthy();
    expectRetryLink();
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows its own sentence for the state code', async () => {
    await renderErrorPage('invalid_state');

    expect(screen.getByRole('heading').textContent).toBe('We could not verify that sign-in.');
    expect(
      screen.getByText(
        'The response did not match the request that started it. Sign-in links are good for ten minutes, so start a fresh one below.',
      ),
    ).toBeTruthy();
    expectRetryLink();
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('falls back to one generic sentence for a code it does not know', async () => {
    await renderErrorPage('token_exchange_failed');

    expect(screen.getByRole('heading').textContent).toBe('We could not finish that sign-in.');
    expect(
      screen.getByText('Nothing was changed on your account. The link below starts a fresh one.'),
    ).toBeTruthy();
    /* The raw code is not user-facing copy. */
    expect(document.body.textContent).not.toContain('token_exchange_failed');
    expectRetryLink();
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the generic sentence when no code is present at all', async () => {
    await renderErrorPage(undefined);

    expect(screen.getByRole('heading').textContent).toBe('We could not finish that sign-in.');
    expectRetryLink();
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders an unknown code as inert text, never as markup (XSS probe)', async () => {
    const probe = '<script>alert("xss")</script><img src=x onerror="alert(1)">';
    await renderErrorPage(probe);

    /* The raw probe appears nowhere on the page... */
    expect(document.body.textContent).not.toContain('<script>');
    expect(document.body.textContent).not.toContain('alert');
    /* ...no element was created from it... */
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    /* ...and the page is still the generic sentence with its one action. */
    expect(screen.getByRole('heading').textContent).toBe('We could not finish that sign-in.');
    expectRetryLink();
    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders a repeated error parameter (string[]) as inert text too', async () => {
    await renderErrorPage(['invalid_state', '<script>alert("xss")</script>']);

    expect(document.body.textContent).not.toContain('<script>');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('heading').textContent).toBe('We could not finish that sign-in.');
    expectRetryLink();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('names no system part and logs nothing', async () => {
    await renderErrorPage('callback_failed');

    expectNoForbiddenJargon();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
