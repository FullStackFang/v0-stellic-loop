'use client';

export default function PortalError({reset}:{reset:()=>void}) {
  return <section className="lt-editor"><h1>Member space unavailable</h1><p role="alert">Your access may have changed, or the service is temporarily unavailable. Reload before making further changes.</p><button onClick={reset}>Try again</button></section>;
}
