import 'server-only';

// Migração silenciosa do v1: usuários e hashes de senha ficavam no Blob privado
// `prospectra/auth.json`. No login, se a conta ainda não existe no banco novo,
// copiamos o usuário e o hash (nunca a senha) — assim a senha antiga continua valendo.
type LegacyUser = { email: string; name?: string; active?: boolean; passwordHash?: string; workspaceMode?: string };

export async function findLegacyUser(email: string): Promise<LegacyUser | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { get } = await import('@vercel/blob');
    const blob = await get('prospectra/auth.json', { access: 'private', useCache: false });
    if (!blob) return null;
    const parsed = JSON.parse(await new Response(blob.stream).text()) as { users?: LegacyUser[] };
    const u = (parsed.users ?? []).find((x) => x.email?.toLowerCase() === email && x.workspaceMode !== 'demo');
    return u && u.active !== false && u.passwordHash ? u : null;
  } catch (e) {
    console.error('legacy lookup failed', e);
    return null;
  }
}
