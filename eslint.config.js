import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['artifacts/**', 'cache/**', 'coverage/**', 'dist/**', 'node_modules/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'hardhat.config.ts',
      'vite.config.ts',
      'vitest.config.ts',
      'scripts/**/*.ts',
      'src/**/*.ts',
      'test/**/*.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'hardhat',
            'react',
            'react-dom',
            'viem',
            'node:fs',
            'node:fs/promises',
            'node:http',
            'node:https',
            'node:process',
          ],
          patterns: ['**/adapters/**', '**/agent/**', '**/api/**', '**/cli/**', '**/verifier/**'],
        },
      ],
    },
  },
);
