import Link from 'next/link';
import { db } from '@/lib/db';
import { groupPath, placeGroup, type GroupRoute } from '@/lib/emba/group-path';
import { Crumbs } from '@/app/groups/group-nav';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { listGroupTree } from '@/lib/emba/group-tree';
import { readDocument } from '@/lib/emba/knowledge';

export const dynamic = 'force-dynamic';
async function loadSource(principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>, route: GroupRoute, id: string, version?: string) {
  const group = placeGroup(await listGroupTree(db(), principal), route);
  if (!group) return null;
  const source = await readDocument(db(), principal, id, version === undefined ? undefined : Number(version));
  return source.orgId === group.orgId && source.loopId === group.loopId ? { group, source } : null;
}

export default async function SourcePage({ params, searchParams }: { params: Promise<GroupRoute & { id: string }>; searchParams: Promise<{ version?: string }> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Source unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`${groupPath((await params).namespace, (await params).slug)}/resources/${(await params).id}`)}`}>Sign in</Link></section>;
  const { id, ...route } = await params, base = groupPath(route.namespace, route.slug);
  const { version } = await searchParams;
  const data = await loadSource(principal, route, id, version).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Source unavailable</h1><p role="alert">The source changed, was removed, or your access ended. Return to the current resource library.</p><Link href={`${base}/resources`}>Resource library</Link></section>;
  const { group, source } = data;
  return <><Crumbs trail={group.trail} here={source.title}><Link className="lp-today" href={`${base}/resources`}>All resources</Link></Crumbs><h1>{source.title}</h1><p>Extracted searchable text · Version {source.version} · {source.state}</p><p>This source is untrusted author-provided content. The original file is not stored for download.</p><pre className="lt-editor" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{source.body.replaceAll('\f', '\n\n[Next PDF page]\n\n')}</pre></>;
}
