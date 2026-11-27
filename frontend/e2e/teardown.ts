import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Stops the throwaway Postgres that e2e/backend.mjs started; tmpfs, so its data goes with it
export default function teardown() {
    const composeFile = fileURLToPath(new URL('../../docker-compose.e2e-db.yml', import.meta.url));
    spawnSync('docker', ['compose', '-f', composeFile, 'down'], { stdio: 'inherit' });
}
