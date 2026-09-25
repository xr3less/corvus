import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TemplateDetailPage from './page';

/* The route slug comes from useParams; the rail reads usePathname. Tests
   steer the slug per case. */
let mockSlug: string | undefined = 'ticket-desk';

vi.mock('next/navigation', () => ({
  useParams: () => (mockSlug === undefined ? {} : { slug: mockSlug }),
  usePathname: () => (mockSlug === undefined ? '/gallery' : `/gallery/${mockSlug}`),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

const DETAIL_ROW = {
  slug: 'ticket-desk',
  name: 'Ticket Desk',
  category: 'tickets',
  capabilities: ['tickets'],
  perms_needed: [
    {
      perm: 'ManageChannels',
      why: 'Manage Channels — so it can create private ticket channels',
    },
    { perm: 'SendMessages', why: 'Send Messages — so it can reply inside tickets' },
  ],
  forks: 57,
  semver: '1.0.0',
  source_spec: {
    version: 1,
    behaviors: [
      {
        kind: 'panel',
        title: 'Open tickets from a panel',
        detail: 'Post a support panel with a button so members open a private ticket.',
      },
      {
        kind: 'routing',
        title: 'Route by topic',
        detail: 'Ask the opener to pick a topic and tag the right helper role.',
      },
    ],
    server_pack: 'Suggested layout: #support panel channel, ticket category.',
  },
};

function detailResponse(row: unknown = DETAIL_ROW) {
  return { ok: true, status: 200, json: async () => row };
}

/* Detail-success stub: GET /api/templates/<slug> resolves, everything else rejects. */
function stubDetailSuccess(row: unknown = DETAIL_ROW) {
  const fetchStub = vi.fn(async (url: unknown) => {
    if (url === '/api/templates/ticket-desk') return detailResponse(row);
    throw new Error('offline');
  });
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

beforeEach(() => {
  mockSlug = 'ticket-desk';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('template detail page', () => {
  it('holds a loading shell until the detail resolves — never a half-mapped page', async () => {
    const fetchStub = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchStub);
    render(<TemplateDetailPage />);

    expect(screen.getByText('Loading template…')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(await screen.findByText('Template unavailable — try again.')).toBeTruthy();
    expect(screen.queryByText('Loading template…')).toBeNull();
    expect(fetchStub).toHaveBeenCalledWith('/api/templates/ticket-desk');
  });

  it('previews behaviors before anything is forked — no fork call on view', async () => {
    const fetchStub = stubDetailSuccess();
    render(<TemplateDetailPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' })).toBeTruthy();
    expect(screen.getByText('Open tickets from a panel')).toBeTruthy();
    expect(screen.getByText('Route by topic')).toBeTruthy();
    expect(screen.getByText(/Suggested layout/)).toBeTruthy();
    /* Nothing forked yet: no fork POST fired from viewing. */
    expect(fetchStub.mock.calls.some((call) => String(call[0]).endsWith('/fork'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Fork' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Forked' })).toBeNull();
  });

  it('shows capabilities and perms why-lines', async () => {
    stubDetailSuccess();
    render(<TemplateDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' });

    expect(screen.getByText('tickets')).toBeTruthy();
    expect(screen.getByText('ManageChannels')).toBeTruthy();
    expect(
      screen.getByText('Manage Channels — so it can create private ticket channels', {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen.getByText('SendMessages')).toBeTruthy();
  });

  it('links Start in chat with the template slug, plus a back link', async () => {
    stubDetailSuccess();
    render(<TemplateDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' });

    const start = screen.getByRole('link', { name: 'Start in chat' });
    expect(start.getAttribute('href')).toBe('/dashboard/new?template=ticket-desk');
    expect(screen.getByRole('link', { name: '← All templates' }).getAttribute('href')).toBe(
      '/gallery',
    );
  });

  it('renders an honest unavailable state on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'not found' }) })),
    );
    render(<TemplateDetailPage />);

    expect(await screen.findByText('Template unavailable — try again.')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fork' })).toBeNull();
  });

  it('never fetches a malformed slug — honest unavailable, no leak', async () => {
    mockSlug = 'BAD SLUG!!';
    const fetchStub = vi.fn().mockRejectedValue(new Error('must not fetch'));
    vi.stubGlobal('fetch', fetchStub);
    render(<TemplateDetailPage />);

    expect(await screen.findByText('Template unavailable — try again.')).toBeTruthy();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('renders honest fallbacks when source_spec is opaque — never a crash', async () => {
    stubDetailSuccess({ ...DETAIL_ROW, source_spec: { version: 1 }, perms_needed: [] });
    render(<TemplateDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' });

    expect(screen.getByText('No behavior preview listed.')).toBeTruthy();
    expect(screen.getByText('No extra permissions needed.')).toBeTruthy();
  });

  it('forks through POST /api/templates/<slug>/fork and shows the handoff trio', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            botId: 'bot-123',
            draftSpecId: 'spec-456',
            version: 1,
            inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1',
          }),
        };
      }
      if (url === '/api/templates/ticket-desk') return detailResponse();
      throw new Error('unexpected call');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<TemplateDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' });

    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/templates/ticket-desk/fork',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByRole('button', { name: 'Forked' })).toBeTruthy();
    expect(screen.getByText('58 forks', { exact: false })).toBeTruthy();
    /* The documented handoff (fork/route.ts:62-66): bot page, shared-app
       invite, and Customize with AI. */
    expect(screen.getByRole('link', { name: 'Open your bot' }).getAttribute('href')).toBe(
      '/dashboard/bots/bot-123',
    );
    const invite = screen.getByRole('link', { name: 'Add to Discord (shared test app)' });
    expect(invite.getAttribute('href')).toBe('https://discord.com/oauth2/authorize?client_id=1');
    expect(invite.getAttribute('target')).toBe('_blank');
    expect(invite.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: 'Customize with AI' }).getAttribute('href')).toBe(
      '/dashboard/bots/bot-123',
    );
  });

  it('shows a logged-out line with a login link on fork 401, without fake success', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) {
        return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
      }
      if (url === '/api/templates/ticket-desk') return detailResponse();
      throw new Error('unexpected call');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<TemplateDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' });

    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toContain('logged out');
    expect(within(alert).getByRole('link', { name: 'log in' }).getAttribute('href')).toBe(
      '/api/auth/login',
    );
    expect(screen.queryByRole('button', { name: 'Forked' })).toBeNull();
    expect(screen.getByText('57 forks', { exact: false })).toBeTruthy();
  });

  it('shows the server error text on fork failure, without fake success', async () => {
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) {
        return { ok: false, status: 500, json: async () => ({ error: 'could not fork' }) };
      }
      if (url === '/api/templates/ticket-desk') return detailResponse();
      throw new Error('unexpected call');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<TemplateDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' });

    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    expect((await screen.findByRole('alert')).textContent).toContain('could not fork');
    expect(screen.queryByRole('button', { name: 'Forked' })).toBeNull();
  });

  it('disables the Fork button while the request is in flight', async () => {
    let resolveFork: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      resolveFork = resolve;
    });
    const fetchStub = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/fork')) return pending;
      if (url === '/api/templates/ticket-desk') return detailResponse();
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchStub);
    render(<TemplateDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Ticket Desk' });

    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    const busy = await screen.findByRole('button', { name: 'Forking…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    resolveFork({
      ok: true,
      status: 200,
      json: async () => ({
        botId: 'bot-1',
        draftSpecId: 'spec-1',
        version: 1,
        inviteUrl: 'https://example.com/invite',
      }),
    });
    expect(await screen.findByRole('button', { name: 'Forked' })).toBeTruthy();
  });
});
