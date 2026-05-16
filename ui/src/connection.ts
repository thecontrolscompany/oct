// Central backend URL configuration.
//
// Dev (Vite dev server): VITE_API_URL is empty. Vite proxies /api and /ws
// to localhost:3001, so same-origin relative paths work.
//
// Production (Vercel + Cloudflare Tunnel): VITE_API_URL is the full tunnel
// URL, e.g. https://oct.yourdomain.com — set in Vercel project env vars.

const API_HOST = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export const API_BASE = API_HOST + '/api';

export function wsUrl(path = '/ws'): string {
  if (!API_HOST) {
    // Dev: derive from current page host so Vite proxy handles it
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}${path}`;
  }
  const wsProto = API_HOST.startsWith('https') ? 'wss' : 'ws';
  const host = API_HOST.replace(/^https?:\/\//, '');
  return `${wsProto}://${host}${path}`;
}
