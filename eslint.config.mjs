// Root ESLint flat config (ESLint 9).
// Project rule (07 §4, SPEC §3): no-explicit-any + no-non-null-assertion are ERRORS.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      // Vendored browser bundles (skill sandbox, not node-scoped product code).
      // Two trees are byte-identical duplicates; both must be ignored.
      '.agents/skills/impeccable/scripts/live-browser*.js',
      '.agents/skills/impeccable/scripts/modern-screenshot.umd.js',
      '.github/skills/impeccable/scripts/live-browser*.js',
      '.github/skills/impeccable/scripts/modern-screenshot.umd.js',
      // Reference-only design sandbox (KI-008/KI-010); not product code.
      'Antigravity/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    // CJS config/support files (Node runtime; web package has no "type":"module").
    files: ['**/*.config.js', '**/*.setup.js', '**/mocks/**'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
