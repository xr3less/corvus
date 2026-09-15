// Minimal next/font/google mock for tests (documents HOW fonts are mocked).
// vitest.config.js aliases 'next/font/google' to this file, so app/layout.tsx
// can be imported in tests without the Next.js font loader.
// Only the loaders used by this app are stubbed; add more (e.g. Inter) if used.
function stubLoader() {
  return { className: 'mock-font', variable: '--mock-font', style: { fontFamily: 'mock-font' } };
}

module.exports = {
  Geist: stubLoader,
  Public_Sans: stubLoader,
};
