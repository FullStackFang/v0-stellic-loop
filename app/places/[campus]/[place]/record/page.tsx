import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { findRecord, placeRecord, RECORD_SPANS, type RecordSpan } from '@/lib/campus/record';
import { schoolOf } from '@/lib/campus/schools';
import './record.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ campus: string; place: string }>; searchParams: Promise<{ k?: string | string[]; span?: string | string[] }> };
const hidden = { index: false, follow: false };
const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : null;
const spanOf = (asked: string | null): RecordSpan => asked === '4' ? 4 : asked === 'all' ? 'all' : 8;
const SPAN_PILL = { 4: '4 weeks', 8: '8 weeks', all: 'All time' } as const;
const SPAN_LINE = { 4: 'the last 4 weeks', 8: 'the last 8 weeks', all: 'all time' } as const;
const weekLabel = (monday: string) => new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const share = (n: number, most: number) => `${most ? Math.round(n / most * 100) : 0}%`;

/** The place the address names, when its key is given or its record is public (design D3). */
async function load({ params, searchParams }: Props) {
  const [{ campus, place }, asked] = await Promise.all([params, searchParams]);
  return { found: await findRecord(db(), campus, place, one(asked.k)), path: `/places/${encodeURIComponent(campus)}/${encodeURIComponent(place)}/record`, key: one(asked.k), span: spanOf(one(asked.span)) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { found } = await load(props);
  if (!found) return { robots: hidden };
  return { title: `${found.name} · Groups at your door · Loopd`, robots: found.public ? undefined : hidden };
}

/**
 * A place's record (openspec campus-venue-record; public/demo/mockups-six-adds.html, section 2): groups that said they
 * were coming, showed up and came back, and with five or more, how they break down. Counts only, never who.
 */
export default async function PlaceRecordPage(props: Props) {
  const { found, path, key, span } = await load(props);
  if (!found) notFound();
  const record = await placeRecord(db(), found.id, span, found.campus.tz, new Date());
  const href = (to: RecordSpan) => { const query = new URLSearchParams({ ...(key && !found.public ? { k: key } : {}), ...(to === 8 ? {} : { span: String(to) }) }).toString(); return query ? `${path}?${query}` : path; };
  const weeks = record.weeks, every = weeks ? Math.ceil(weeks.length / 8) : 1, most = weeks ? Math.max(...weeks.map(week => week.showed)) : 0;
  const sizes = record.sizes && [['2 people', record.sizes.two], ['3 or 4', record.sizes.threeFour], ['5 or more', record.sizes.fivePlus]] as const;
  const days = record.days && [['Mon to Thu', record.days.monThu], ['Friday', record.days.friday], ['Weekend', record.days.weekend]] as const;
  const bars = (rows: readonly (readonly [string, number])[], tone: string) => {
    const top = Math.max(...rows.map(([, n]) => n));
    return <ul className="cs-rec-bars">{rows.map(([name, n]) => <li key={name}><span>{name}</span><i className={tone} style={{ width: share(n, top) }} /><b>{n}</b></li>)}</ul>;
  };
  return <main className="cs-rec" data-kit={schoolOf(found.campus.slug)}>
    <header className="cs-rec-band">
      <h1>{found.name}</h1>
      <p>{found.campus.name} · {SPAN_LINE[span]}</p>
      <nav className="cs-rec-spans" aria-label="How far back">{RECORD_SPANS.map(each => <Link key={each} href={href(each)} replace scroll={false} aria-current={each === span ? 'true' : undefined}>{SPAN_PILL[each]}</Link>)}</nav>
    </header>
    <div className="cs-rec-inner">
      <div className="cs-rec-nums">
        <div className="cs-rec-num"><strong>{record.said}</strong><span>groups said they were coming</span><small>{record.people} {record.people === 1 ? 'person' : 'people'}</small></div>
        <div className="cs-rec-num"><strong>{record.showed}</strong><span>groups showed up</span><small>checked in at your door</small></div>
        <div className="cs-rec-num dark"><strong>{record.back}</strong><span>groups came back</span><small>the same people, another day</small></div>
      </div>
      {weeks && <section className="cs-rec-panel"><h2>Groups that showed up, by week</h2>
        <ol className="cs-rec-weeks" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>{weeks.map((week, at) => {
          const named = (weeks.length - 1 - at) % every === 0;
          return <li key={week.week} title={`Week of ${weekLabel(week.week)}: ${week.showed}`}>
            <i style={{ height: share(week.showed, most) }}>{named && week.showed > 0 && <b>{week.showed}</b>}</i>
            <span>{named ? weekLabel(week.week) : ''}</span></li>;
        })}</ol></section>}
      {sizes && days && <div className="cs-rec-two">
        <section className="cs-rec-panel"><h2>How big the groups were</h2>{bars(sizes, '')}</section>
        <section className="cs-rec-panel"><h2>When they came</h2>{bars(days, 'lime')}</section>
      </div>}
      <p className="cs-rec-note"><b>How a group is counted.</b> Each person pressed Check in on their own phone, within about 150 m of your door, during the hours of the plan. A group is two or more who did. Loopd never shows you who they were.</p>
    </div>
  </main>;
}
