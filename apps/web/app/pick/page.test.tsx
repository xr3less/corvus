import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PickPage from './page';
import { PICK_PLACEHOLDER, VARIANTS } from './variants';

const STORAGE_KEY = 'pick:input:round1';

function mockFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ votes: {} }) } as unknown as Response),
  );
}

describe('/pick page', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('exposes 8-10 variants', () => {
    expect(VARIANTS.length).toBeGreaterThanOrEqual(8);
    expect(VARIANTS.length).toBeLessThanOrEqual(10);
  });

  it('renders one live input per variant', () => {
    render(<PickPage />);
    const inputs = screen.getAllByPlaceholderText(PICK_PLACEHOLDER);
    expect(inputs).toHaveLength(VARIANTS.length);
  });

  it('renders a vote toggle per card', () => {
    render(<PickPage />);
    const buttons = screen.getAllByRole('button', { name: /Seç/ });
    expect(buttons).toHaveLength(VARIANTS.length);
  });

  it('marks the picked variant and posts the vote', () => {
    render(<PickPage />);
    const buttons = screen.getAllByRole('button', { name: /Seç/ });

    fireEvent.click(buttons[0]);

    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/pick/vote');
    expect(JSON.parse(init.body)).toEqual({ variantId: VARIANTS[0].id, delta: 1 });
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain(VARIANTS[0].id);
  });

  it('un-picking sends a -1 delta', () => {
    render(<PickPage />);
    const buttons = screen.getAllByRole('button', { name: /Seç/ });

    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByRole('button', { name: /Seçildi/ }));

    const lastCall = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(lastCall[1].body)).toEqual({ variantId: VARIANTS[0].id, delta: -1 });
  });
});
