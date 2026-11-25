// Windows: VS Code starts terminals in "c:\..." but Node resolves modules as "C:\...", so Vitest loads
// twice and every suite fails with "failed to find the current suite". Before Vitest starts, fix the drive
// letter's case in the cwd and in the path Vitest itself is loaded from (this script's own path keeps the
// lowercase "c:"). vitest.mjs isn't in the package's "exports", so it is imported by file URL.
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendDir = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(realpathSync.native(process.cwd()));
await import(pathToFileURL(path.join(frontendDir, 'node_modules', 'vitest', 'vitest.mjs')).href);
