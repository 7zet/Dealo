/**
 * Cross-site request forgery guard for the same-origin BFF and sign-in routes.
 *
 * The session lives in SameSite=Lax cookies, which already keeps them off most cross-site requests.
 * This check adds a second, independent layer: a state-changing request (POST, PUT, PATCH, DELETE)
 * is accepted only when the browser says it comes from this site. Every current browser sends an
 * `Origin` header on such requests; older ones send `Sec-Fetch-Site` or at least `Referer`.
 *
 * A request without any of the three headers is not from a browser (curl, server-to-server), so it
 * cannot carry a victim's cookies by accident and is let through; the routes still require a valid
 * session for anything that matters.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function hostOf(origin: string): string {
  return new URL(origin).host.toLowerCase();
}

/**
 * Hosts this site answers on: the configured public address and the host the request was sent to.
 * A browser cannot forge `Host` or `X-Forwarded-Host` on a cross-site request (the latter would need
 * a CORS preflight this app never grants), so they name the real target.
 */
function ownHosts(request: Request, siteUrl: string | undefined): Set<string> {
  const hosts = new Set<string>();
  const site = originOf(siteUrl);
  if (site) hosts.add(hostOf(site));
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwarded || request.headers.get('host');
  if (host) hosts.add(host.toLowerCase());
  else {
    const target = originOf(request.url);
    if (target) hosts.add(hostOf(target));
  }
  return hosts;
}

export type CsrfVerdict = { ok: true } | { ok: false; reason: string };

/** Whether a request may change state on behalf of the browser's session. */
export function checkSameOrigin(
  request: Request,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): CsrfVerdict {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { ok: true };
  const hosts = ownHosts(request, siteUrl);

  const origin = request.headers.get('origin');
  if (origin !== null) {
    const parsed = originOf(origin);
    if (!parsed) return { ok: false, reason: 'opaque_origin' };
    return hosts.has(hostOf(parsed)) ? { ok: true } : { ok: false, reason: 'foreign_origin' };
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null) {
    return fetchSite === 'same-origin' ? { ok: true } : { ok: false, reason: 'cross_site_fetch' };
  }

  const referer = request.headers.get('referer');
  if (referer !== null) {
    const parsed = originOf(referer);
    return parsed && hosts.has(hostOf(parsed))
      ? { ok: true }
      : { ok: false, reason: 'foreign_referer' };
  }

  return { ok: true };
}

/** A 403 problem document for a rejected request, or null when the request may proceed. */
export function rejectCrossSite(request: Request): Response | null {
  const verdict = checkSameOrigin(request);
  if (verdict.ok) return null;
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      code: 'csrf_rejected',
      detail: verdict.reason,
      instance: new URL(request.url).pathname,
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
    },
  );
}
