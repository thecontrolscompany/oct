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
const FALLBACK_HOST = isLocalPage ? '' : 'http://localhost:3001';
const RESOLVED_HOST = API_HOST || FALLBACK_HOST;

export const API_BASE = RESOLVED_HOST + '/api';
export const HAS_API_HOST = RESOLVED_HOST.length > 0;

export function wsUrl(path = '/ws'): string {
  if (!RESOLVED_HOST) {
    // Dev: derive from current page host so Vite proxy handles it.
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}${path}`;
  }
  const wsProto = RESOLVED_HOST.startsWith('https') ? 'wss' : 'ws';
  const host = RESOLVED_HOST.replace(/^https?:\/\//, '');
  return `${wsProto}://${host}${path}`;
}
