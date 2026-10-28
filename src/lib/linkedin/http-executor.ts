import 'server-only';
import type { LinkedInExecutor, LinkedInWorkItem } from './automation';

// Executor HTTP para o worker de LinkedIn na VPS (navegador headless + cookie li_at + proxy).
// Segredos (cookie, proxy) ficam SÓ na VPS; o app nunca os vê. Sem env → sem executor:
// runLinkedinQueue vira no-op e o fluxo assistido na Fila continua idêntico.
export function linkedinExecutor(env: NodeJS.ProcessEnv = process.env): LinkedInExecutor | undefined {
  const baseUrl = env.LINKEDIN_WORKER_URL?.trim();
  const key = env.LINKEDIN_WORKER_KEY?.trim();
  if (!baseUrl || !key) return undefined;
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Configure a URL HTTPS do worker de LinkedIn sem credenciais nem query.');
  }
  const endpoint = `${url.origin}${url.pathname.replace(/\/$/, '')}/dispatch`;
  return {
    async dispatch(item: LinkedInWorkItem) {
      // Qualquer dúvida → 'unknown'. A fila nunca reenvia um resultado incerto.
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) return { state: 'unknown' };
        const data = (await res.json().catch(() => ({}))) as { state?: string; providerId?: string };
        return data.state === 'sent' ? { state: 'sent', providerId: data.providerId } : { state: 'unknown' };
      } catch {
        return { state: 'unknown' };
      }
    },
  };
}
