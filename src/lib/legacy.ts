import 'server-only';

// Migração silenciosa do v1: usuários e hashes de senha ficavam no Blob privado
// `prospectra/auth.json`. No login, se a conta ainda não existe no banco novo,
// copiamos o usuário e o hash (nunca a senha) — assim a senha antiga continua valendo.
type LegacyUser = { email: string; name?: string; role?: string; active?: boolean; passwordHash?: string; workspaceMode?: string };

/** Diagnóstico (só admin): usuários do v1 sem expor senha/hash. `error` explica por que a lista veio vazia. */
export async function listLegacyUsers(): Promise<{ users: { email: string; name?: string; role?: string; active: boolean; mode?: string; hash: 'v1' | 'v2' | 'ausente' }[]; error?: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { users: [], error: 'BLOB_READ_WRITE_TOKEN não configurado neste ambiente.' };
  try {
    const { get } = await import('@vercel/blob');
    const blob = await get('prospectra/auth.json', { access: 'private', useCache: false });
    if (!blob) return { users: [], error: 'Arquivo prospectra/auth.json não encontrado no Blob.' };
    const parsed = JSON.parse(await new Response(blob.stream).text()) as { users?: LegacyUser[] };
    return {
      users: (parsed.users ?? []).map((u) => ({
        email: u.email, name: u.name, role: u.role, active: u.active !== false, mode: u.workspaceMode,
        hash: !u.passwordHash ? 'ausente' : u.passwordHash.split('$').length === 6 ? 'v1' : 'v2',
      })),
    };
  } catch (e) {
    return { users: [], error: `Falha ao ler o Blob: ${e instanceof Error ? e.message : String(e)}` };
  }
}

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
