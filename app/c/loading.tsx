import { PageWait } from '@/components/loading/page-wait';

// What a campus page shows while it loads. It has to be here, under the campus layout: a loading file above a layout
// that both pages share is not shown when moving between them (openspec loop-loading-seats, design D3).
export default function CampusLoading() {
  return <PageWait />;
}
