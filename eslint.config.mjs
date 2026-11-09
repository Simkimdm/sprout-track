import nextPlugin from '@next/eslint-plugin-next';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Note: eslint-plugin-react is intentionally not included — its latest
// release (7.37.x) does not support ESLint 10 yet (context.getFilename was
// removed). typescript-eslint requires TypeScript <6.1, so the repo pins
// typescript ^5.9.3 (TS 7 is not supported by typescript-eslint).
export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'prisma/migrations/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
    settings: {
      next: { rootDir: '.' },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      // Keep the classic hook rules as errors; the react-hooks v7
      // compiler-powered rules are too strict for this codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      // High-noise rules for this codebase: warn instead of error.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-location-assign-relative-destination': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
];
