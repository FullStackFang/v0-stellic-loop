'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, useTransition, type FormEvent } from 'react';
import { changeTrip, joinTrip } from '@/actions/trip';
import { verifyCode } from '@/actions/verifyCode';
import { IdentityFields, type Ident } from './IdentityFields';
import type { Board } from '@/lib/types';
import { tripDate, type Trip, type TripItem } from '@/lib/trip';
import './TripView.css';

type Panel = 'activity' | 'arrival' | 'stay' | 'document' | 'settings' | 'signin' | null;
export function TripView({ board, trip, items, me, written = null }: { board: Board; trip: Trip; items: TripItem[]; me: { id: string; name: string } | null; written?: { id: string; text: string; documents: { id: string; name: string }[] } | null }) {
  const router = useRouter();
  const [tab, setTab] = useState('Itinerary'), [panel, setPanel] = useState<Panel>(null);
  const [busy, start] = useTransition(), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [stage, setStage] = useState<'identity' | 'code'>('identity');
  const [ident, setIdent] = useState<Ident>({ name: '', phone: '', code: '' });
  const canEdit = useSyncExternalStore(() => () => {}, () => !!written && !!localStorage.getItem(`loop:trip:edit:${written.id}`), () => false);
  const own = items.filter(i => i.owner_id === me?.id);
  const activities = items.filter(i => i.kind === 'activity');
  const visible = tab === 'My travel' ? own.filter(i => i.kind !== 'activity') : tab === 'Files' ? items.filter(i => i.kind === 'document') : items.filter(i => i.kind !== 'document' && (i.shared || i.owner_id === me?.id));
  const myArrivals = own.filter(i => i.kind === 'arrival' && i.day && i.location);
  const nearby = items.filter(i => i.kind === 'arrival' && i.owner_id !== me?.id && myArrivals.some(a => a.day === i.day && a.location.trim().toLowerCase() === i.location.trim().toLowerCase()));
  function open(next: Panel) { setError(''); setNotice(''); setPanel(me ? next : 'signin'); }
  function run(operation: 'settings' | 'item' | 'delete' | 'rsvp', data: FormData) {
    setError('');
    start(async () => {
      try {
        const result = await changeTrip(board.slug, operation, data);
        if (result.error) return setError(result.error);
        setPanel(null); setNotice(operation === 'delete' ? 'Removed.' : 'Saved.'); router.refresh();
      } catch { setError('Could not save. Please try again.'); }
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (panel !== 'document') return run(panel === 'settings' ? 'settings' : 'item', data);
    setError('');
    start(async () => {
      try {
        const response = await fetch(`/api/trip/${board.slug}/files`, { method: 'POST', body: data });
        const result = await response.json();
        if (!response.ok) return setError(result.error || 'Upload failed. Try again.');
        setPanel(null); setNotice('Document saved.'); router.refresh();
      } catch { setError('Upload failed. Check your connection and try again.'); }
    });
  }
  function signIn() {
    start(async () => {
      try {
        const result = stage === 'code' ? await verifyCode(ident) : await joinTrip(board.slug, ident);
        if (result.status === 'error') {
          setError(result.message);
          if (result.error === 'expired' || result.error === 'too_many') setStage('identity');
        } else if (result.status === 'needs_code') setStage('code');
        else { setPanel(null); setNotice('You’re in. Add your travel details when you’re ready.'); router.refresh(); }
      } catch { setError('Could not sign in. Please try again.'); }
    });
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href.split('?')[0]); setNotice('Trip link copied. Anyone with the link can see shared plans and files.'); }
    catch { setNotice(`Share this link: ${window.location.href.split('?')[0]}`); }
  }
  const titles = { activity: 'Plan something together', arrival: 'Add your arrival', stay: 'Add your stay', document: 'Upload a document', settings: 'Trip details', signin: 'Join the trip' };
  return <div className="lt-trip">
    <header className="lt-header"><Link href='/' className="lt-logo">Loop</Link><span>A little less coordinating. A lot more going.</span><button onClick={share}>Share trip</button></header>
    <main className="lt-main">
      <section className="lt-hero">
        <div><p className="lt-eyebrow">Your cohort, out in the world</p><h1>{board.name}</h1><p>{trip.destination || 'The destination is still open.'}</p><div className="lt-dates">{trip.start_day ? tripDate(trip.start_day) : 'Dates to come'}{trip.end_day ? ` — ${tripDate(trip.end_day)}` : ''}</div></div>
        <div className="lt-ticket"><span>One trip. Your own way there.</span><p>Flights, stays, and the things you’ll do together. Keep it all here.</p>{trip.owner_id === me?.id ? <button onClick={() => open('settings')}>Edit trip details</button> : !me ? <button onClick={() => open('signin')}>Join the trip</button> : <span>Welcome, {me.name}</span>}</div>
      </section>
      <div className="lt-columns">
        {canEdit && written && <Link className="lt-write-edit" href={`/trips/${written.id}/edit`}>Edit trip draft</Link>}
        <div className="lt-content">
          <div className="lt-toolbar"><nav aria-label='Trip views'>{['Itinerary', 'My travel', 'Files'].map(label => <button key={label} aria-current={tab === label ? 'page' : undefined} onClick={() => { setTab(label); setPanel(null); setError(''); }}>{label}</button>)}</nav><button className="lt-primary" onClick={() => open(tab === 'Files' ? 'document' : tab === 'My travel' ? 'arrival' : 'activity')}>{tab === 'Files' ? 'Upload file' : tab === 'My travel' ? 'Add travel' : '+ Add activity'}</button></div>
          <p className="lt-caption">{tab === 'Itinerary' ? 'The shared plan, with room to do your own thing. Times are local to each place.' : tab === 'My travel' ? 'Your flights, accommodation, and documents. Private unless you choose to share.' : 'Original itineraries, tickets, and useful details. Private files are visible only to you.'}</p>
          {notice && <p className="lt-notice" role='status'>{notice}</p>}
          {tab === 'Itinerary' && written?.text && <p className="lt-written">{written.text}</p>}
          {tab === 'Files' && !!written?.documents.length && <section className="lt-written-files"><h2>Trip documents</h2>{written.documents.map(doc => <a key={doc.id} href={`/api/trips/${written.id}/documents/${doc.id}`} target="_blank" rel="noreferrer">{doc.name}</a>)}</section>}
          {error && <p className="lt-error" role='alert'>{error}</p>}
          {panel && <section className="lt-editor" aria-label={titles[panel]}><div className="lt-sectionHead"><h2>{titles[panel]}</h2><button onClick={() => { setPanel(null); setError(''); }} disabled={busy}>Cancel</button></div>
            {panel === 'signin' ? <IdentityFields signedIn={false} stage={stage} value={ident} onChange={setIdent} onSubmit={signIn} busy={busy} cta='Send sign-in code' /> : <form onSubmit={submit}>
              {panel === 'settings' ? <><label>Destination<input name='destination' maxLength={200} defaultValue={trip.destination} placeholder='Where is the cohort headed?' /></label><div className="lt-pair"><label>Starts<input name='start' type='date' defaultValue={trip.start_day || ''} /></label><label>Ends<input name='end' type='date' defaultValue={trip.end_day || ''} /></label></div></> : <>
                <input type='hidden' name='kind' value={panel} />
                <label>{panel === 'document' ? 'Document title' : 'Title'}<input name='title' maxLength={120} required={panel !== 'document'} placeholder={panel === 'activity' ? 'Dinner together, a day trip, a free afternoon…' : panel === 'arrival' ? 'My flight to the trip' : panel === 'stay' ? 'My accommodation' : 'Cohort itinerary'} /></label>
                {panel === 'document' ? <><label>Choose a file<input name='file' type='file' accept='.pdf,.jpg,.jpeg,.png,.txt' required /></label><p className="lt-caption">PDF, JPG, PNG, or text. Up to 3 MB. The original file is saved; add scheduled activities separately.</p></> : <><div className="lt-pair"><label>{panel === 'arrival' ? 'Arrival date' : panel === 'stay' ? 'Check-in date' : 'Date'}<input name='day' type='date' /></label><label>Local time<input name='time' type='time' /></label></div><label>{panel === 'arrival' ? 'Arrival airport or station' : 'Place'}<input name='location' maxLength={200} placeholder={panel === 'arrival' ? 'Use the airport code, e.g. LHR' : 'Address or meeting point'} /></label><label>Details<textarea name='notes' maxLength={4000} rows={3} placeholder='Anything useful to know' /></label></>}
                {panel !== 'activity' ? <label className="lt-check"><input name='shared' type='checkbox' /> Share with anyone who has the trip link</label> : <p className="lt-caption">Activities are shared with the cohort. People can join independently.</p>}
              </>}
              <button className="lt-primary" disabled={busy}>{busy ? 'Saving…' : panel === 'document' ? 'Save document' : 'Save'}</button>
            </form>}
          </section>}
          {!visible.length ? <section className="lt-empty"><div className="lt-routeArt" aria-hidden='true'><span>&#9675;</span><i /><span>&#9678;</span><i /><span>&#9675;</span></div><h2>{tab === 'Itinerary' ? 'A trip starts with a plan.' : tab === 'My travel' ? 'Your journey belongs here.' : 'All the details, in one place.'}</h2><p>{tab === 'Itinerary' ? 'Have the cohort itinerary? Upload it so everyone can find it, then add the activities you’ll do together.' : tab === 'My travel' ? 'Arrive when it works for you. Add your flight or stay and choose what to share.' : 'Save the itinerary for everyone, or keep your own booking documents private.'}</p><button className="lt-primary" onClick={() => open(tab === 'My travel' ? 'arrival' : 'document')}>{tab === 'My travel' ? 'Add your arrival' : 'Upload itinerary'}</button></section> : <div className="lt-timeline">{visible.map(item => <article className="lt-item" key={item.id}>
            <div className="lt-when"><strong>{item.kind === 'document' ? 'File' : tripDate(item.day)}</strong><span>{item.time || (item.kind === 'document' ? item.filename?.split('.').pop()?.toUpperCase() : 'Time open')}</span></div>
            <div className="lt-itemBody"><div className="lt-itemMeta">{item.kind === 'activity' ? 'Together' : item.kind === 'arrival' ? 'Arrival' : item.kind === 'stay' ? 'Stay' : 'Document'}<span>{item.shared ? 'Shared' : 'Only you'}</span></div><h3>{item.title}</h3>{item.location && <p>{item.location}</p>}{item.notes && <p className="lt-notes">{item.notes}</p>}<small>Added by {item.owner_id === me?.id ? 'you' : item.owner}</small>
              <div className="lt-itemActions">{item.kind === 'activity' && <><span>{item.count} going</span><button disabled={busy} aria-pressed={item.joined} onClick={() => { if (!me) return open('signin'); const f = new FormData(); f.set('id', item.id); f.set('join', item.joined ? 'no' : 'yes'); run('rsvp', f); }}>{item.joined ? 'Joined · Leave' : 'Join activity'}</button></>}{item.filename && <a href={`/api/trip/${board.slug}/files/${item.id}`}>Download document</a>}{item.owner_id === me?.id && <button disabled={busy} onClick={() => { if (!window.confirm(`Remove “${item.title}”?`)) return; const f = new FormData(); f.set('id', item.id); run('delete', f); }}>Remove</button>}</div>
            </div>
          </article>)}</div>}
        </div>
        <aside className="lt-aside"><section><h2>Make it your trip</h2><p>Start with your plans. Coordinate the rest together.</p><button onClick={() => open('arrival')}><span aria-hidden='true'>&#8599;</span> Add your arrival</button><button onClick={() => open('stay')}><span aria-hidden='true'>&#8962;</span> Add your stay</button><button onClick={() => open('document')}><span aria-hidden='true'>&#9636;</span> Save a document</button></section>
          <section className="lt-coordination"><h2>Around the cohort</h2>{nearby.length ? <><p>You have company arriving at the same place on the same day.</p>{nearby.map(i => <p key={i.id}><strong>{i.owner}</strong><br />{i.location} · {tripDate(i.day)}{i.time ? `, ${i.time}` : ''}</p>)}<button onClick={() => open('activity')}>Plan a shared transfer</button></> : <p>Share your arrival details to help others coordinate a transfer with you.</p>}<hr /><p>{activities.filter(i => !i.joined).length ? `${activities.filter(i => !i.joined).length} activities you haven’t joined yet.` : 'Something in mind for the group?'}</p><button onClick={() => open('activity')}>Suggest an activity</button></section>
        </aside>
      </div>
      <footer className="lt-footer"><Link href='/'>Loop</Link><span>Everyone has a plan. Now they’re in one place.</span><Link href='/privacy'>Privacy</Link></footer>
    </main>
  </div>;
}
