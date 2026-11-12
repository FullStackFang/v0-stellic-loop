import Link from 'next/link';
import { Arrow, Rings } from '@/components/LoopGlyphs';
import './home.css';

// The landing page, on the Loop system (app/loop.css). It describes what is built: the team version.
export default function Home() {
  return <div className="lp lp-home">
    <header className="lp-top"><Link href='/' className="lp-top-mark"><Rings /><span>Loop</span></Link><span>Your groups, in the AI you already use</span></header>
    <main className="lp-home-main">
      <section className="lp-plate lp-home-hero">
        <Rings className="lp-mark" inline />
        <div><p className="lp-handle">For the groups you’re already in</p><h1>Stay in the loop.<br />Without chasing it.</h1><p>Loop connects the AI you already use to your team, so everyone can ask it what the plan is.</p></div>
        <div className="lp-dateblock lp-home-ticket"><b>Tell the plan once.</b><p>Who has what, where the files are, when it’s due. Everyone’s own AI answers from it.</p></div>
      </section>
      <div className="lp-home-cols">
        <section className="lt-editor"><h2>Start with your team</h2><p>Write the plan in plain words and add the links. Anyone on the team can ask their own AI “what’s mine?” or “where’s the latest version?” and get the answer with the right link.</p><Link className="lp-btn lp-btn-primary" href="/groups">Open your groups<Arrow /></Link></section>
        <aside className="lt-editor"><h2>Not a new app.</h2><p>Loop works inside Claude, and on this site if you’d rather not use an assistant. It doesn’t replace your group chat or your shared drive, and it doesn’t read your conversations.</p><h2>Clubs and trips are next.</h2><p>Events, who’s interested, and quick polls are on the way.</p><Link className="lp-btn" href='/groups/connections'>Connect your assistant<Arrow /></Link></aside>
      </div>
      <p className="lp-home-foot">Here for the cohort trip? <Link href='/b/emba27'>Open the trip board</Link></p>
    </main>
  </div>;
}
