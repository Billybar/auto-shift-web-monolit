import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // User feedback goes through notify / InlineAlert / useConfirm (see CLAUDE.md), not native dialogs
      'no-alert': 'error',
      'no-restricted-imports': ['error', {
        paths: [{ name: 'sonner', importNames: ['toast'], message: 'Show toasts through notify from src/lib/notify.ts.' }],
      }],
    },
  },
  {
    // The one module allowed to call sonner's toast directly
    files: ['src/lib/notify.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
])
