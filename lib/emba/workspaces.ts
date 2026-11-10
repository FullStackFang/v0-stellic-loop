import 'server-only';
import { z } from 'zod';
import type { Db } from '../db';
import { canAccessPersonal, type Principal } from './access';
import { audit } from './consent';
import { EmbaError } from './errors';
import type { GroupAddress } from './groups';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/);
const createSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000),
  namespace: slug,
});

export async function createWorkspace(db: Db, principal: Principal, input: unknown): Promise<GroupAddress> {
  const data = createSchema.parse(input);
  const allowed = (process.env.LOOP_PILOT_OWNER_SUBJECTS ?? '').split(',').map(subject => subject.trim()).filter(Boolean);
  if (principal.clientId !== null || !principal.verifiedEmail || !allowed.includes(principal.subject)) throw new EmbaError('forbidden');
  try {
    return await db.tx(async q => {
      await q.query('set transaction isolation level serializable');
      if (!await canAccessPersonal(q, principal, principal.personId)) throw new EmbaError('forbidden');
      const { rows: [org] } = await q.query<{ id: string }>(
        'insert into emba_organization(name,description) values($1,$2) returning id', [data.name, data.description]);
      const { rows: [loop] } = await q.query<{ id: string }>(
        'insert into emba_loop(org_id,path) values($1,$2) returning id', [org.id, data.namespace]);
      await q.query('insert into emba_membership(org_id,person_id) values($1,$2)', [org.id, principal.personId]);
      await q.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')", [org.id, loop.id, principal.personId]);
      await q.query('insert into emba_group_namespace(org_id,namespace) values($1,$2)', [org.id, data.namespace]);
      await q.query("insert into emba_group_address(org_id,loop_id,namespace,slug) values($1,$2,$3,'workspace')", [org.id, loop.id, data.namespace]);
      await audit(q, principal, 'activity:write', loop.id);
      return { orgId: org.id, loopId: loop.id, namespace: data.namespace, slug: 'workspace', handle: `@${data.namespace}/workspace`, orgName: data.name, loopPath: data.namespace };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw new EmbaError('conflict');
    throw error;
  }
}
