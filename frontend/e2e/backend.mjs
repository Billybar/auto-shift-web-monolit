// The backend for the Playwright run (a webServer entry in playwright.config.ts):
// starts the throwaway Postgres, then a demo-mode uvicorn on :8010 against it.
// Every setting is passed in the env, and load_dotenv doesn't override env that is already set,
// so the dev .env never leaks in. An empty DB is built by init_schema() on startup.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const composeFile = fileURLToPath(new URL('../../docker-compose.e2e-db.yml', import.meta.url));
const python = fileURLToPath(new URL(
    process.platform === 'win32' ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python',
    import.meta.url,
));

if (!existsSync(python)) {
    console.error(`[e2e] No Python virtualenv at ${python}.`);
    console.error('[e2e] Create it from the repo root: python -m venv .venv, then install requirements.txt into it.');
    process.exit(1);
}

// --force-recreate: a run that aborted before the teardown leaves the container up; start from an empty DB anyway
const db = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d', '--wait', '--force-recreate'], { stdio: 'inherit' });
if (db.status !== 0) {
    console.error('[e2e] Could not start the e2e Postgres (is Docker running?).');
    process.exit(db.status ?? 1);
}

const server = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8010', '--no-access-log'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
        ...process.env,
        DATABASE_URL: 'postgresql://e2e_user:e2e_pass@localhost:5434/e2e_db',
        SECRET_KEY: 'e2e-only-secret-key-not-used-anywhere-else',
        ENVIRONMENT: 'development',
        DEMO_MODE: 'true',
        DEMO_SANDBOX_TTL_HOURS: '48',
        // Every test opens its own sandbox from the same IP
        DEMO_MAX_SANDBOXES_PER_IP_PER_HOUR: '10000',
        DEMO_CLIENT_IP_HEADER: '',
        // 8 workers prove a schedule optimal in well under a second (see CLAUDE.md, Demo instance)
        SOLVER_NUM_WORKERS: '8',
        SOLVER_MAX_SECONDS: '15',
    },
});

// Playwright stops this process at the end of the run; take uvicorn with it
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
