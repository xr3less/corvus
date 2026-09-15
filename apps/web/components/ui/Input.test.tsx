import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders a visible label above the control', () => {
    render(<Input id="bot-name" label="Bot name" placeholder="Study Hall" />);
    const label = screen.getByText('Bot name');
    expect(label.tagName.toLowerCase()).toBe('label');
    expect(label.getAttribute('for')).toBe('bot-name');
    expect(screen.getByPlaceholderText('Study Hall').getAttribute('id')).toBe('bot-name');
  });

  it('announces the error message and marks the control invalid', () => {
    render(<Input id="bot-name" label="Bot name" error="Name is required." />);
    const message = screen.getByRole('alert');
    expect(message.textContent).toBe('Name is required.');
    const control = screen.getByLabelText('Bot name');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(control.getAttribute('aria-describedby')).toBe('bot-name-error');
  });

  it('renders disabled state', () => {
    render(<Input id="bot-name" label="Bot name" disabled />);
    expect((screen.getByLabelText('Bot name') as HTMLInputElement).disabled).toBe(true);
  });
});
