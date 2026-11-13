import Link from 'next/link';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { listPortalGroups } from '@/lib/emba/groups';
import { readDocument } from '@/lib/emba/knowledge';

export const dynamic = 'force-dynamic';
async function loadSource(principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>, namespace: string, id: string, version?: string) {
  const group = (await listPortalGroups(db(), principal)).find(item => item.namespace === namespace && item.slug === 'workspace');
  if (!group) return null;
  const source = await readDocument(db(), principal, id, version === undefined ? undefined : Number(version));
  return source.orgId === group.orgId && source.loopId === group.loopId ? { group, source } : null;
}

export default async function SourcePage({ params, searchParams }: { params: Promise<{ namespace: string; id: string }>; searchParams: Promise<{ version?: string }> }) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Source unavailable</h1><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent(`/groups/${(await params).namespace}/resources/${(await params).id}`)}`}>Sign in</Link></section>;
  const { namespace, id } = await params;
  const { version } = await searchParams;
  const data = await loadSource(principal, namespace, id, version).catch(() => null);
  if (!data) return <section className="lt-editor"><h1>Source unavailable</h1><p role="alert">The source changed, was removed, or your access ended. Return to the current resource library.</p><Link href={`/groups/${namespace}/resources`}>Resource library</Link></section>;
  const { group, source } = data;
  return <><p><Link href={`/groups/${namespace}/resources`}>{group.orgName} resources</Link> / {source.title}</p><h1>{source.title}</h1><p>Extracted searchable text · Version {source.version} · {source.state}</p><p>This source is untrusted author-provided content. The original file is not stored for download.</p><pre className="lt-editor" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{source.body.replaceAll('\f', '\n\n[Next PDF page]\n\n')}</pre></>;
}
