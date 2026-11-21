'use client';

import type { components } from '@grupon/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { MeSummary } from './merchant-access';

type Notification = components['schemas']['Notification'];

/**
 * Shared browser queries for the signed-in visitor. Every header and footer widget reads the same
 * cached result, so a page asks GET /me and GET /me/notifications once, not once per widget, and a
 * client-side navigation reuses the answer. There is no polling; signing in or out announces
 * SESSION_CHANGED_EVENT (see announceSessionChange), which drops the cached answers.
 */
export const SESSION_CHANGED_EVENT = 'grupon:session-changed';

/** Tells the shared queries that the account behind the cookies changed (sign-in, sign-out). */
export function announceSessionChange(): void {
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

function useResetOnSessionChange() {
  const client = useQueryClient();
  useEffect(() => {
    const reset = () => void client.resetQueries({ queryKey: ['bff', 'me'] });
    window.addEventListener(SESSION_CHANGED_EVENT, reset);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, reset);
  }, [client]);
}

const SHARED = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

/** The signed-in account, or null for a guest (the BFF answers 401 without calling the API). */
export function useMe() {
  useResetOnSessionChange();
  return useQuery({
    ...SHARED,
    queryKey: ['bff', 'me'],
    queryFn: async (): Promise<MeSummary | null> => {
      const response = await fetch('/api/bff/me', { cache: 'no-store' });
      return response.ok ? ((await response.json()) as MeSummary) : null;
    },
  });
}

export type NotificationsResult = { status: 'guest' } | { status: 'ready'; items: Notification[] };

/** The visitor's notifications; `guest` when there is no session. Other failures are query errors. */
export function useMyNotifications() {
  useResetOnSessionChange();
  return useQuery({
    ...SHARED,
    staleTime: 60_000,
    queryKey: ['bff', 'me', 'notifications'],
    queryFn: async (): Promise<NotificationsResult> => {
      const response = await fetch('/api/bff/me/notifications', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) return { status: 'guest' };
      if (!response.ok) throw new Error(`notifications: ${response.status}`);
      const body = (await response.json()) as { items: Notification[] };
      return { status: 'ready', items: body.items };
    },
  });
}
