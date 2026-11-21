/**
 * Every sign-in reaches the API from this server's address. Forwarding the browser's address lets
 * the API key its per-address limit on the real visitor instead of putting every visitor into one
 * shared bucket. The API believes these headers only from a trusted proxy (loopback by default, or
 * TRUSTED_PROXIES); from anywhere else they are ignored.
 */
export function forwardHeaders(request: Request): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) headers.set('X-Forwarded-For', forwarded);
  const realIP = request.headers.get('x-real-ip');
  if (realIP) headers.set('X-Real-IP', realIP);
  return headers;
}
