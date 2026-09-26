import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlanApprovalCard } from './plan-approval-card';

describe('PlanApprovalCard', () => {
  it('renders the frozen approval copy', () => {
    render(<PlanApprovalCard onApprove={() => {}} approving={false} />);
    expect(screen.getByText('Plan hazır — doğru görünüyor mu?')).toBeTruthy();
    expect(screen.getByText('Değişiklik istersen yazman yeterli.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Planı onayla ve kurulumu başlat' })).toBeTruthy();
  });

  it('submit-path: clicking Onayla calls onApprove exactly once and nothing else', () => {
    const onApprove = vi.fn();
    render(<PlanApprovalCard onApprove={onApprove} approving={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Planı onayla ve kurulumu başlat' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('approving=true disables the button and shows the sending line', () => {
    const onApprove = vi.fn();
    render(<PlanApprovalCard onApprove={onApprove} approving={true} />);
    const button = screen.getByRole('button', { name: 'Onayın gönderiliyor…' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(onApprove).not.toHaveBeenCalled();
  });
});
