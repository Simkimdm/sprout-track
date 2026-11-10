import babelEslintParser from '@babel/eslint-parser';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Parser note: typescript-eslint does not support TypeScript 7 yet, so TS/TSX
// files are parsed with @babel/eslint-parser (TS-aware scope analysis, unlike
// plain @babel/parser + eslint-scope which crashes on TS syntax). Type-aware
// lint rules are therefore not available — type checking is covered by `tsc`
// (see the build). eslint-plugin-react is not included either: its latest
// release (7.37.x) does not support ESLint 10 (context.getFilename removed).
const base = {
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
    parser: babelEslintParser,
    parserOptions: {
      requireConfigFile: false,
      ecmaFeatures: { jsx: true },
      babelOptions: {
        plugins: [
          ['@babel/plugin-syntax-typescript', { isTSX: true, allExtensions: true }],
          '@babel/plugin-syntax-jsx',
        ],
      },
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
    // Classic hook rules stay errors; the react-hooks v7 compiler-powered
    // rules are too strict for this codebase.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/immutability': 'off',
    'react-hooks/static-components': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    // High-noise rules for this codebase: warn instead of error.
    '@next/next/no-img-element': 'warn',
    '@next/next/no-location-assign-relative-destination': 'warn',
    'prefer-const': 'warn',
    'no-var': 'warn',
  },
};

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
  {
    ...base,
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
  },
];
