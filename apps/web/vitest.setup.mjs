// Vitest setup: jsdom environment is selected in vitest.config.mjs.
// @testing-library/react auto-cleanup needs a global afterEach; wire it explicitly.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
