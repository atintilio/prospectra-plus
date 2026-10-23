/** Import all active accounts together. Existing records (including blocked accounts) always win. */
export async function syncUsers(query, legacyUsers, masterEmail = 'atintilio@argusprime.com.br') {
  const primary = masterEmail.trim().toLowerCase();
  const secondary = 'mloro@argusprime.com.br';
  let imported = 0;
  for (const entry of legacyUsers) {
    if (entry.active === false || ['disabled','blocked','cancelled','canceled','removed','deleted'].includes(entry.status) || entry.deletedAt || entry.removedAt) continue;
    let email = String(entry.email || '').trim().toLowerCase();
    // Exact correction supplied by the owner; never guess other addresses.
    if (email === 'mloro@argusprime.om.br') email = secondary;
    if (!email.includes('@')) continue;
    const admin = email === primary || email === secondary;
    const inserted = await query(`insert into users (email,name,password_hash,platform_role,status) values ($1,$2,$3,$4,$5) on conflict (email) do nothing returning id`, [email,entry.name || '',entry.passwordHash || null,admin?'admin':'user',entry.passwordHash?'active':'invited']);
    imported += inserted.length;
    const [user] = await query('select id,status,platform_role from users where email=$1',[email]);
    if (!user || user.status==='disabled') continue;
    // Existing passwords and roles are never overwritten by an old snapshot.
    if (entry.workspaceMode!=='demo') {
      const memberships = await query('select m.org_id from memberships m join orgs o on o.id=m.org_id where m.user_id=$1 and o.is_demo=false',[user.id]);
      if (memberships.length) continue;
      const [org] = await query('select id from orgs where is_demo=false and active=true order by created_at limit 1',[]);
      if (org) await query('insert into memberships (org_id,user_id,role) values ($1,$2,$3) on conflict do nothing',[org.id,user.id,admin?'owner':entry.role==='leader'?'manager':'sdr']);
    }
  }
  // Bootstrap the two named administrators once; subsequent deliberate changes persist.
  return imported;
}
