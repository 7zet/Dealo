import net from 'node:net';

/**
 * Specs sign in with the same seeded phones on every run, so repeated local runs would hit the real
 * per-phone sign-in limit (10 codes per 15 minutes). Before the run, drop only the sign-in counters
 * (`ratelimit:otp:*`) from the dev Redis. The limit itself stays on and is covered by Go tests.
 * Without a reachable Redis (e.g. limiter disabled) this does nothing.
 */
export default async function globalSetup() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://:redis_dev_password@localhost:6379/0');
  const commands = [];
  if (url.password) commands.push(['AUTH', decodeURIComponent(url.password)]);
  const db = url.pathname.replace('/', '');
  if (db) commands.push(['SELECT', db]);
  commands.push([
    'EVAL',
    "local n = 0 for _, k in ipairs(redis.call('KEYS', ARGV[1])) do n = n + redis.call('DEL', k) end return n",
    '0',
    'ratelimit:otp:*',
  ]);
  try {
    const replies = await send(url.hostname, Number(url.port || 6379), commands);
    const failed = replies.find((reply) => reply.startsWith('-'));
    if (failed) console.warn(`[e2e] could not reset sign-in limits: ${failed.slice(1)}`);
  } catch (error) {
    console.warn(`[e2e] Redis not reachable, sign-in limits not reset: ${error.message}`);
  }
}

/** Sends RESP commands and resolves with one raw reply line per command. */
function send(host, port, commands) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const payload = commands
      .map(
        (args) =>
          `*${args.length}\r\n` +
          args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join(''),
      )
      .join('');
    let buffer = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('timeout')));
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n').filter(Boolean);
      if (lines.length >= commands.length) {
        socket.end();
        resolve(lines.slice(0, commands.length));
      }
    });
    socket.on('error', reject);
  });
}
