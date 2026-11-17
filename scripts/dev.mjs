// Starts web, API and worker with the root .env loaded. Turbo runs in strict env mode by default and would
// otherwise hide these variables from the apps (the API would fall back to its built-in localhost:5432 URL).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const child = spawn('turbo', ['run', 'dev', '--parallel', '--env-mode=loose'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
