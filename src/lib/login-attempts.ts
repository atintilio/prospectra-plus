import { eq } from 'drizzle-orm';
import type { DB } from '@/db';
import { schema } from '@/db';
import { verifyPassword } from '@/lib/crypto';

const LOCK_MS = 15 * 60_000;

/** Serializa a verificação e a contagem para que tentativas simultâneas não se percam. */
export async function verifyLoginAttempt(db: DB, userId: string, password: string, now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).for('update');
    if (!user || user.status !== 'active') return false;
    if (user.loginLockedUntil && user.loginLockedUntil > now) return false;
    if (await verifyPassword(password, user.passwordHash)) {
      if (user.failedLoginAttempts || user.loginLockedUntil) {
        await tx.update(schema.users).set({ failedLoginAttempts: 0, loginLockedUntil: null }).where(eq(schema.users.id, userId));
      }
      return true;
    }
    const attempts = user.loginLockedUntil ? 1 : user.failedLoginAttempts + 1;
    await tx.update(schema.users).set({
      failedLoginAttempts: attempts,
      loginLockedUntil: attempts >= 4 ? new Date(now.getTime() + LOCK_MS) : null,
    }).where(eq(schema.users.id, userId));
    return false;
  });
}
