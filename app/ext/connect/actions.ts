'use server';

import { db } from '@/lib/db';
import { connectExt, extReady, revokeExt } from '@/lib/campus/ext';
import { campusViewer } from '@/lib/campus/session';

// Connect and Disconnect on /ext/connect (openspec loopd-browser-extension, design D4).

/** A new token for the extension in this browser. It is handed to the extension and not kept anywhere else. */
export async function connectExtAction(): Promise<{ token: string } | { message: string }> {
  const viewer = await campusViewer();
  if (!viewer) return { message: 'Sign in to connect the extension.' };
  if (!await extReady(db())) return { message: 'The browser extension is not set up yet.' };
  return { token: await connectExt(db(), viewer.personId) };
}

/** Disconnect: every extension this person connected is refused from now on. */
export async function disconnectExtAction(): Promise<{ ok: boolean }> {
  const viewer = await campusViewer();
  if (!viewer || !await extReady(db())) return { ok: false };
  await revokeExt(db(), viewer.personId);
  return { ok: true };
}
