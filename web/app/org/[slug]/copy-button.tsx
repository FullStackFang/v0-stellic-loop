"use client";

import { useState } from "react";

/** Copies `text` to the clipboard and confirms briefly. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context or denied): the URL is shown
      // beside the button, so the organizer can still select and copy it.
    }
  }

  return (
    <button type="button" onClick={copy} className="pls-btn pls-btn--secondary pls-btn--sm">
      {copied ? "Copied" : label}
    </button>
  );
}
