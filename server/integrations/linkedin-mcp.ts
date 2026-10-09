export type LinkedInMcpConfig = { baseUrl: string; apiKey?: string; user?: string; password?: string };

export function linkedinMcpConfig(): LinkedInMcpConfig | null {
  const baseUrl = process.env.LINKEDIN_MCP_BASE_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) return null;
  try { const url = new URL(baseUrl); if (!['https:', 'http:'].includes(url.protocol)) return null; } catch { return null; }
  return { baseUrl, apiKey: process.env.LINKEDIN_MCP_API_KEY?.trim() || undefined, user: process.env.LINKEDIN_MCP_USER?.trim() || undefined, password: process.env.LINKEDIN_MCP_PASSWORD?.trim() || undefined };
}

export async function linkedinMcpHealth() {
  const config = linkedinMcpConfig();
  if (!config) return { configured: false, status: 'not_configured' as const, detail: 'Configure LINKEDIN_MCP_BASE_URL apontando para o servidor LinkedIn MCP open source na VM.' };
  const started = Date.now();
  try {
    const headers: Record<string, string> = {};
    if (config.user && config.password) headers.Authorization = `Basic ${Buffer.from(`${config.user}:${config.password}`).toString('base64')}`;
    else if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const response = await fetch(`${config.baseUrl}${process.env.LINKEDIN_MCP_HEALTH_PATH?.trim() || '/mcp'}`, { headers, signal: AbortSignal.timeout(8000) });
    const reachable = response.ok || response.status === 405;
    return { configured: true, status: reachable ? 'connected' as const : 'failed' as const, detail: reachable ? 'Servidor LinkedIn MCP respondeu ao health check.' : `Servidor LinkedIn MCP respondeu HTTP ${response.status}.`, latencyMs: Date.now() - started };
  } catch { return { configured: true, status: 'failed' as const, detail: 'Servidor LinkedIn MCP não respondeu. Verifique a VM e o reverse proxy.', latencyMs: Date.now() - started }; }
}
