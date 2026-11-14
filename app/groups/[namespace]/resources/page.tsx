import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { db } from '@/lib/db';
import { groupPath, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs } from '@/app/groups/group-nav';
import { canAccessLoop } from '@/lib/emba/access';
import { getPortalPrincipal, openGroup } from '@/lib/emba/portal-session';
import { listDocuments } from '@/lib/emba/knowledge';
import { ActionForm } from '@/components/emba/portal-forms';
import { publishResource, removeResource, retryResource } from '@/app/groups/resource-actions';

export const dynamic = 'force-dynamic';
async function loadResources(principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>, route: GroupRoute) {
  const opened = await openGroup(principal, route, scope => Promise.all([listDocuments(db(), principal, scope), db().tx(q => canAccessLoop(q, principal, scope.orgId, scope.loopId, 'manage'))]));
  if (!opened) return null;
  const { group, data: [documents, manages] } = opened;
  return { group, documents, manages };
}

export default async function ResourcesPage({ params }: { params: Promise<GroupRoute> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Resources unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`${groupPath((await params).namespace, (await params).slug)}/resources`)}`}>Sign in</Link></section>;
  const route = await params, base = groupPath(route.namespace, route.slug);
  const data = await loadResources(principal, route).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Resources unavailable</h1><p role="alert">This group is unavailable or your membership changed.</p></section>;
  const { group, documents, manages } = data;
  return <>
      <Crumbs trail={group.trail} here="Resources" /><h1>Resource library</h1>
      <p>Searchable text is kept here; the original uploaded bytes are discarded after extraction. Supported: pasted text, UTF-8 .txt/.md, and text-based .pdf.</p>
      <section className="lt-editor"><h2>Current resources</h2>{documents.length ? <ul>{documents.map(doc => <li key={doc.id}><Link href={`${base}/resources/${doc.id}?version=${doc.version}`}>{doc.title}</Link> · version {doc.version} · {doc.state}{doc.failedStage && ` (${doc.failedStage} failed)`}
        {manages && <><ActionForm action={retryResource} label="Retry processing"><input type="hidden" name="documentId" value={doc.id}/><input type="hidden" name="version" value={doc.version}/></ActionForm><ActionForm action={removeResource} label="Remove resource"><input type="hidden" name="documentId" value={doc.id}/><input type="hidden" name="version" value={doc.version}/></ActionForm><details><summary>Replace resource</summary><ActionForm action={publishResource} label="Replace"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/><input type="hidden" name="documentId" value={doc.id}/><input type="hidden" name="expectedVersion" value={doc.version}/><input type="hidden" name="operationId" value={randomUUID()}/><label>File<input name="file" type="file" accept=".txt,.md,.pdf" /></label><label>Or paste replacement text<textarea name="body" /></label><label>Title for pasted text<input name="title" maxLength={200}/></label></ActionForm></details></>}
      </li>)}</ul> : <p>No resources yet.</p>}{documents.length === 100 && <p>The group has reached its 100-resource limit. Replace or remove one before adding another.</p>}</section>
      {manages && <section className="lt-editor"><h2>Add a resource</h2><p>PDF: 3 MiB and 100 pages maximum. Extracted text: 256 KiB and 200 passages maximum. Scanned PDFs need OCR before uploading.</p><ActionForm action={publishResource} label="Add and index resource"><input type="hidden" name="orgId" value={group.orgId}/><input type="hidden" name="loopId" value={group.loopId}/><input type="hidden" name="operationId" value={randomUUID()}/><label>File<input name="file" type="file" accept=".txt,.md,.pdf" /></label><label>Or paste text<textarea name="body" /></label><label>Title for pasted text<input name="title" maxLength={200}/></label></ActionForm></section>}
  </>;
}
