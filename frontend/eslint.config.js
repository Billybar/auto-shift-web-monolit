import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Cross-folder imports go through the @/ alias (→ src/); ./ stays for the file's own folder and below
const parentImports = { group: ['../*'], message: 'Import from other folders with @/… (→ src/).' }

// Neutral colours are slate only (see CLAUDE.md, Frontend rule 8)
const otherNeutrals = '/-(gray|zinc|neutral|stone)-\\d/'
const neutralsMessage = 'Use slate-* for neutral colours.'

export default defineConfig([
    globalIgnores(['dist', 'coverage']),
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
                patterns: [parentImports],
            }],
            'no-restricted-syntax': ['error',
                { selector: `Literal[value=${otherNeutrals}]`, message: neutralsMessage },
                { selector: `TemplateElement[value.raw=${otherNeutrals}]`, message: neutralsMessage },
            ],
        },
    },
    {
        // The one module allowed to call sonner's toast directly
        files: ['src/lib/notify.ts'],
        rules: { 'no-restricted-imports': ['error', { patterns: [parentImports] }] },
    },
    {
        // Test helpers mix components and functions, and are never hot-reloaded
        files: ['src/test/**'],
        rules: { 'react-refresh/only-export-components': 'off' },
    },
    {
        // Playwright runs in Node; its fixtures call use(), which the hooks rule mistakes for React's use()
        files: ['e2e/**', 'playwright.config.ts'],
        languageOptions: { globals: globals.node },
        rules: {
            'react-hooks/rules-of-hooks': 'off',
            'react-refresh/only-export-components': 'off',
        },
    },
])
