import { PartWait } from '@/components/loading/page-wait';

// Shown the moment a page under /groups is opened, while its reads run: a tap is answered at once, not when the data arrives.
// The bar is in the layout and stays; the ticket takes the page's place (openspec loop-loading-seats).
export default function GroupsLoading() {
  return <PartWait />;
}
