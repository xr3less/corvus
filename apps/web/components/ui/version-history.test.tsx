import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VersionHistory, type VersionHistoryItem } from './version-history';

const BOT = '11111111-2222-4333-8444-555555555555';

const V2: VersionHistoryItem = {
  id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  version: 2,
  createdAt: '2026-09-12T10:00:00.000Z',
  isDraft: true,
  isProd: false,
};

const V1: VersionHistoryItem = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  version: 1,
  createdAt: '2026-09-11T10:00:00.000Z',
  isDraft: false,
  isProd: true,
};

function stubVersions(versions: VersionHistoryItem[]): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ versions })));
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

describe('VersionHistory', () => {
  it('shows the empty state when there is no earlier version to undo to', async () => {
    stubVersions([]);
    render(<VersionHistory botId={BOT} onUndo={() => {}} />);

    expect(screen.getByText('Compare versions')).toBeTruthy();
    expect(await screen.findByText('No earlier version to undo to.')).toBeTruthy();
    expect(screen.queryByText('Undo keeps the current version for re-apply.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo to previous version' })).toBeNull();
    expect(fetch).toHaveBeenCalledWith(`/api/bots/${BOT}/versions`);
  });

  it('renders one undo row per version and calls back with the row id and number', async () => {
    const onUndo = vi.fn();
    stubVersions([V2, V1]);
    render(<VersionHistory botId={BOT} onUndo={onUndo} />);

    expect(screen.getByText('Compare versions')).toBeTruthy();
    expect(await screen.findByText('2026-09-12T10:00:00.000Z')).toBeTruthy();
    expect(screen.getByText('2026-09-11T10:00:00.000Z')).toBeTruthy();

    const buttons = screen.getAllByRole('button', { name: 'Undo to previous version' });
    expect(buttons).toHaveLength(2);
    expect(screen.getByText('Undo keeps the current version for re-apply.')).toBeTruthy();

    fireEvent.click(buttons[0]);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith(V2.id, 2);
  });
});
