// src/test/setup.ts
// Runs before every test file (vite.config.ts → test.setupFiles)
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount whatever a test rendered (Vitest runs without globals, so RTL can't register this itself)
afterEach(() => {
    cleanup();
});
