import { db } from '@/lib/db';
import { handleExt } from '@/lib/campus/ext';

// The Loopd extension's "Leave" (openspec loopd-browser-extension, design D8).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handleExt(db(), request, 'leave'); }
