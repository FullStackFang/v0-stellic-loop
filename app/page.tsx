import Link from 'next/link';
import '@/components/TripView.css';
export default function Home() {
  return <div className="lt-trip">
    <header className="lt-header"><Link href='/' className="lt-logo">Loop</Link><span>Your cohort, out in the world</span></header>
    <main className="lt-main">
      <section className="lt-hero"><div><p className="lt-eyebrow">The cohort global trip</p><h1>Go together.<br />Get there your way.</h1><p>Your itinerary, everyone’s arrivals, and the plans in between.</p></div><div className="lt-ticket"><span>Start with what you already have.</span><p>Upload the itinerary. Add your flight and stay. Share one link with the cohort.</p></div></section>
      <div className="lt-columns"><section className="lt-editor"><h2>A home for your trip</h2><p className="lt-caption">Write the trip like a message. Dates, places, and documents fill the draft as you go.</p><Link className="lt-primary" style={{display:'inline-block',padding:'12px 18px',borderRadius:9,textDecoration:'none'}} href="/trips/new">Create trip →</Link></section><aside className="lt-aside"><h2>Useful before anyone joins.</h2><p>Keep your own bookings together. Share the details you want the cohort to see.</p><h2>Better when they do.</h2><p>Find others arriving with you and make smaller plans within the trip.</p><Link href='/b/emba27'>Open the existing cohort space</Link></aside></div>
    </main>
  </div>;
}
