// Central backend URL configuration.
//
// Dev (Vite dev server): VITE_API_URL is empty. Vite proxies /api and /ws
// to localhost:3001, so same-origin relative paths work.
//
// Production (Vercel + Cloudflare Tunnel): VITE_API_URL is the full tunnel
// URL, e.g. https://oct.yourdomain.com — set in Vercel project env vars.

const API_HOST = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const isLocalPage = typeof window !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(window.location.hostname);

const LOCAL_HELPER_HOST = isLocalPage ? '' : 'http://127.0.0.1:3001';
const DEFAULT_HOST = API_HOST || LOCAL_HELPER_HOST;

export const API_BASE = DEFAULT_HOST + '/api';
export const HAS_API_HOST = DEFAULT_HOST.length > 0;

export function apiBaseCandidates(): string[] {
  const candidates = [DEFAULT_HOST];
  if (!candidates.includes('http://127.0.0.1:3001') && !isLocalPage) {
    candidates.push('http://127.0.0.1:3001');
  }
  if (!candidates.includes('http://localhost:3001') && !isLocalPage) {
    candidates.push('http://localhost:3001');
  }
  return candidates;
}

export function wsUrl(path = '/ws'): string {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
  const host = (!isLocalPage && DEFAULT_HOST && DEFAULT_HOST === browserOrigin)
    ? 'http://127.0.0.1:3001'
    : (DEFAULT_HOST || browserOrigin);
  const wsProto = host.startsWith('https') ? 'wss' : 'ws';
  return `${wsProto}://${host.replace(/^https?:\/\//, '')}${path}`;
}
