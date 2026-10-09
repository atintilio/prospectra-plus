export function demoArea(): boolean { return window.location.pathname === '/demo' || window.location.pathname.startsWith('/demo/'); }
export function appPath(path: string): string { return `${demoArea() ? '/demo' : ''}${path === '/' && demoArea() ? '' : path}`; }
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('X-Prospectra-Session', demoArea() ? 'demo' : 'production');
  return fetch(input, { ...init, headers });
}
