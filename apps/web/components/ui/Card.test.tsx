import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders title, body and footer slots', () => {
    render(
      <Card title="Study Hall" footer={<button type="button">Open</button>}>
        <p>1,240 members</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Study Hall' })).toBeTruthy();
    expect(screen.getByText('1,240 members')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
  });
});
