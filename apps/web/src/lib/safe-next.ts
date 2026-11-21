import { isLocale } from '@grupon/config';

/**
 * Removes a leading locale segment: `/en/account/profile` → `/account/profile`, `/ru` → `/`.
 * Post-login navigation goes through next-intl's locale-aware router, which adds the current locale
 * itself; a target that already carries one would otherwise become `/en/en/...` (a 404).
 */
export function stripLocalePrefix(path: string): string {
  const match = /^\/([^/?#]+)(.*)$/.exec(path);
  const [, segment = '', rest = ''] = match ?? [];
  if (!match || !isLocale(segment)) return path;
  if (rest === '') return '/';
  if (rest.startsWith('/')) return rest;
  // `/en?x=1` or `/en#top`: keep the query or hash on the root path.
  return `/${rest}`;
}

/**
 * Accepts only same-site relative paths for post-login redirects. Protocol-relative and absolute
 * URLs fall back to the homepage so the login form cannot be used as an open redirect. The result
 * never carries a locale prefix (see stripLocalePrefix): callers navigate with the locale-aware
 * router or prefix the visitor's locale themselves.
 */
export function safeNextPath(value: string | undefined): string {
  if (!isSameSitePath(value)) return '/';
  const path = stripLocalePrefix(value);
  // Checked again: `/en//evil.example` would otherwise become the protocol-relative `//evil.example`.
  return isSameSitePath(path) ? path : '/';
}

function isSameSitePath(value: string | undefined): value is string {
  return Boolean(value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\'));
}
