import { describe, expect, it } from 'vitest';

import { forwardHeaders } from './forward-headers';

describe('forwardHeaders', () => {
  it('passes the browser address on to the API', () => {
    const request = new Request('http://localhost/api/auth/phone-code', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7', 'x-real-ip': '198.51.100.7' },
    });
    const headers = forwardHeaders(request);
    expect(headers.get('X-Forwarded-For')).toBe('198.51.100.7');
    expect(headers.get('X-Real-IP')).toBe('198.51.100.7');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('sends no address headers when the request has none', () => {
    const headers = forwardHeaders(new Request('http://localhost/', { method: 'POST' }));
    expect(headers.has('X-Forwarded-For')).toBe(false);
    expect(headers.has('X-Real-IP')).toBe(false);
  });
});
