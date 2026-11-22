import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Specs run against the dev stack and leave their deals, branches and uploads behind ("E2E aksiya",
 * "Moderatsiya approve …"), which then show up on the public pages during manual QA. After the run,
 * reload the deterministic seed so the dev database is clean again. Set E2E_KEEP_DATA=1 to keep the
 * data for debugging. The seed command itself refuses to run when APP_ENV=production.
 */
export default function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === '1') return;
  const root = fileURLToPath(new URL('..', import.meta.url));
  if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
  const result = spawnSync('go', ['run', './cmd/seed'], {
    cwd: `${root}services/api`,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    console.warn('[e2e] could not reset the dev database; run the seed by hand');
}
