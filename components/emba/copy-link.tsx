'use client';

import { useState } from 'react';

/** Copies a message as written, link included. */
export function CopyText({ text, label = 'Copy message' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="lp-btn" onClick={() => { navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'Message copied' : label}</button>;
}

/** Copies a link to the clipboard. The page shows the link itself elsewhere, so a refused copy is not an error worth a message. */
export function CopyLink({ url, label = 'Copy link' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="lp-btn" onClick={() => { navigator.clipboard.writeText(new URL(url, window.location.origin).href).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'Link copied' : label}</button>;
}
