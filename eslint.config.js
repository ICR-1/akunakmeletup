import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // PRD 16.3: semua keacakan lewat src/core/rng.ts
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Gunakan src/core/rng.ts (PRNG berseed).' },
      ],
    },
  },
  {
    // PRD 16.5: rules dan events murni, tanpa Three.js / DOM
    files: ['src/rules/**/*.ts', 'src/events/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', '**/ui/*', '**/scenes/*', '**/gen/*'] }],
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'HTMLElement'],
    },
  },
);
