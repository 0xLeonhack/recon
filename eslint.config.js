import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['artifacts/**', 'cache/**', 'coverage/**', 'dist/**', 'node_modules/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.ts', 'src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: globals.node,
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
