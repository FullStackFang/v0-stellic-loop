import 'server-only';
import { db } from '../db';

/**
 * Whether this person belongs to any group: a live role in a group they are a live member of. With the campus screen in
 * front, this is what opens the groups site to someone who is not the admin (openspec loop-on-you, design D12). It says
 * only that the site opens; every page and write still checks the person's role in the group it touches.
 */
export async function inAGroup(personId: string): Promise<boolean> {
  try {
    const { rows } = await db().query(`select 1 from emba_role r join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
      where r.person_id=$1 and r.revoked_at is null and m.revoked_at is null limit 1`, [personId]);
    return rows.length > 0;
  } catch { return false; }
}
