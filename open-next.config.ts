import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Build do Prospectra+ para Cloudflare Workers (OpenNext).
 *
 * O app roda em Node (VPS) e em Cloudflare Workers com o mesmo codigo: o que
 * muda e a conexao com o banco, que no Worker vem do binding HYPERDRIVE
 * (ver `src/db/index.ts`).
 */
export default defineCloudflareConfig();
