export const PRIMARY_ADMIN_EMAIL = 'atintilio@argusprime.com.br';
export const OPERATIONS_ADMIN_EMAIL = 'mloro@argusprime.com.br';
export function isPrimaryAdmin(email: string) {
  return email.trim().toLowerCase() === (process.env.MASTER_USER_EMAIL || PRIMARY_ADMIN_EMAIL).trim().toLowerCase();
}
export function canChangeUser(actor: { id: string; email: string; platformRole: string }, target: { id: string; email: string }) {
  return actor.platformRole === 'admin' && actor.id !== target.id && !isPrimaryAdmin(target.email);
}
