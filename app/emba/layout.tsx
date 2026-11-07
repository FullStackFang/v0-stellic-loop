import Link from 'next/link';
import '@/components/TripView.css';
import './portal.css';

export default function EmbaLayout({ children }: { children: React.ReactNode }) {
  return <div className="lt-trip emba-portal"><header className="lt-header"><Link href="/" className="lt-logo">Loop</Link><span>EMBA member space</span></header><main className="lt-main">{children}</main></div>;
}
