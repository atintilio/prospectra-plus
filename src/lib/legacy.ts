import 'server-only';
import { readFile } from 'node:fs/promises';

// Migração silenciosa do v1: usuários e hashes de senha ficavam no arquivo privado
// `prospectra/auth.json`. No login, se a conta ainda não existe no banco novo,
// copiamos o usuário e o hash (nunca a senha) — assim a senha antiga continua valendo.
// No deploy na VPS, esse arquivo fica em LEGACY_AUTH_FILE (padrão: /etc/prospectra/auth.json),
// com permissão 600, somente root. Nunca commite este arquivo no Git.
type LegacyUser = { email: string; name?: string; role?: string; active?: boolean; passwordHash?: string; workspaceMode?: string };

const LEGACY_AUTH_FILE = process.env.LEGACY_AUTH_FILE || '/etc/prospectra/auth.json';

/** Diagnóstico (só admin): usuários do v1 sem expor senha/hash. `error` explica por que a lista veio vazia. */
export async function listLegacyUsers(): Promise<{ users: { email: string; name?: string; role?: string; active: boolean; mode?: string; hash: 'v1' | 'v2' | 'ausente' }[]; error?: string }> {
  try {
    const raw = await readFile(LEGACY_AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { users?: LegacyUser[] };
    return {
      users: (parsed.users ?? []).map((u) => ({
        email: u.email, name: u.name, role: u.role, active: u.active !== false, mode: u.workspaceMode,
        hash: !u.passwordHash ? 'ausente' : u.passwordHash.split('$').length === 6 ? 'v1' : 'v2',
      })),
    };
  } catch (e) {
    return { users: [], error: `Falha ao ler ${LEGACY_AUTH_FILE}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function findLegacyUser(email: string): Promise<LegacyUser | null> {
  try {
    const raw = await readFile(LEGACY_AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { users?: LegacyUser[] };
    const u = (parsed.users ?? []).find((x) => x.email?.toLowerCase() === email && x.workspaceMode !== 'demo');
    return u && u.active !== false && u.passwordHash ? u : null;
  } catch (e) {
    console.error('legacy lookup failed', e);
    return null;
  }
}
