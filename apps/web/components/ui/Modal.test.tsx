import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Delete bot" onClose={onClose}>
        <p>This removes the bot from your servers.</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Delete bot' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requires the exact phrase before a destructive confirm', () => {
    const onConfirm = vi.fn();
    render(
      <Modal
        title="Delete bot"
        onClose={() => {}}
        confirmLabel="Delete bot"
        onConfirm={onConfirm}
        confirmPhrase="DELETE"
        tone="danger"
      >
        <p>This cannot be undone.</p>
      </Modal>,
    );
    const confirm = screen.getByRole('button', { name: 'Delete bot' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
