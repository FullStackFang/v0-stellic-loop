import { redirect } from 'next/navigation';
import { groupPath, type GroupRoute } from '@/lib/emba/group-path';

export const dynamic = 'force-dynamic';
// Resources are a tab of the team page (loop-resources-tab). An old link, a bookmark or the rail of an earlier version lands there.
export default async function ResourcesPage({ params }: { params: Promise<GroupRoute> }) {
  const route = await params;
  redirect(`${groupPath(route.namespace, route.slug)}/team?tab=resources`);
}
