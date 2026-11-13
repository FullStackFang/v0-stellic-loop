import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db';
import type { Principal } from './access';
import { enableAccessRequests } from './access-requests';
import { EmbaError } from './errors';
import { groupHandle } from './group-path';
import { createInnerGroup, innerSlug, listGroupTree } from './group-tree';
import type { GroupAddress } from './groups';
import { issueInvitation } from './invitations';
import { processDocument, uploadDocument } from './knowledge';
import { parseResourceFile, ResourceInputError } from './resource-input';
import { emailOf, linkTitle, START_LIMITS } from './start-sort';
import { normaliseLink } from './team-link';
import { postAnnouncement, fileOutput } from './team-records';
import { singleLine } from './team-text';
import { createWorkspace } from './workspaces';

const INVITATION_DAYS = 14;
const startSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  slug: innerSlug,
  /** The handle of the group this one goes inside, or null for a top-level group. */
  parent: z.string().max(100).nullable(),
  links: z.array(z.string().max(8000)).max(START_LIMITS.links),
  people: z.array(z.string().max(254)).max(START_LIMITS.people),
  note: z.string().max(5000),
});
export type StartInput = z.input<typeof startSchema> & { files: File[] };
/** What a start did: the group, its join link (shown once), what went in from each lane, and what did not, by name. */
export type StartReport = {
  group: GroupAddress;
  joinToken: string | null;
  added: { files: string[]; links: string[]; people: string[]; announcement: string | null };
  failed: { what: string; why: string }[];
};

/**
 * Starts a group and puts into it what the person dropped into the box. The group is made first, in its own
 * transaction: if that fails nothing else happens and the error is thrown. Everything after is applied piece by piece,
 * so one unreadable file or refused link is reported and does not undo the group or the rest.
 */
export async function startGroup(db: Db, p: Principal, input: StartInput): Promise<StartReport> {
  const { files, ...rest } = input;
  const data = startSchema.parse(rest);
  if (files.length > START_LIMITS.files) throw new EmbaError('conflict');
  let group: GroupAddress;
  if (data.parent === null) group = await createWorkspace(db, p, { name: data.name, description: '', namespace: data.slug });
  else {
    // The picker shows where a person may start a group; the answer that counts is taken here, again.
    const parent = (await listGroupTree(db, p)).find(item => groupHandle(item) === data.parent && item.canStart);
    if (!parent) throw new EmbaError('forbidden');
    group = await createInnerGroup(db, p, { orgId: parent.orgId, parentLoopId: parent.loopId, name: data.name, description: '', slug: data.slug });
  }
  const scope = { orgId: group.orgId, loopId: group.loopId };
  const report: StartReport = { group, joinToken: null, added: { files: [], links: [], people: [], announcement: null }, failed: [] };
  const attempt = async (what: string, why: string, run: () => Promise<void>) => {
    try { await run(); } catch (error) { report.failed.push({ what, why: error instanceof ResourceInputError ? error.message : why }); }
  };

  for (const file of files) await attempt(file.name, 'Loop could not read this file. Add it on the Resources page.', async () => {
    const document = await uploadDocument(db, p, { ...scope, operationId: randomUUID(), ...await parseResourceFile(file) });
    report.added.files.push(file.name);
    // Reading the text can be retried from the Resources page; the file is already kept.
    await processDocument(db, p, document.id, document.version).catch(() => undefined);
  });

  // A group made a moment ago has no decisions yet, so a link is filed against none.
  for (const raw of data.links) await attempt(raw.slice(0, 80), 'Loop only keeps plain https links.', async () => {
    const link = normaliseLink(raw);
    if ('problem' in link) throw new Error(link.problem);
    const result = await fileOutput(db, p, { ...scope, operationId: randomUUID(), url: link.url, title: linkTitle(link.url), summary: 'Added when the group was started.', decisionsVersion: 0 });
    if (!result.saved) throw new Error(result.reason);
    report.added.links.push(link.url);
  });

  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000).toISOString();
  for (const raw of data.people) await attempt(raw, 'This is not an email address Loop can invite.', async () => {
    const recipientEmail = emailOf(raw);
    if (!recipientEmail) throw new Error('not an email');
    await issueInvitation(db, p, { ...scope, recipientEmail, role: 'member', expiresAt });
    report.added.people.push(recipientEmail);
  });

  const note = singleLine(data.note);
  if (note) await attempt('First announcement', 'The announcement was too long to post. Post a shorter one from the group page.', async () => {
    const result = await postAnnouncement(db, p, { ...scope, operationId: randomUUID(), text: note });
    if (!result.saved) throw new Error(result.reason);
    report.added.announcement = note;
  });

  await attempt('Join link', 'The join link could not be turned on. Turn it on from the Members page.', async () => {
    report.joinToken = await enableAccessRequests(db, p, { ...scope, publicLabel: '' });
  });
  return report;
}
