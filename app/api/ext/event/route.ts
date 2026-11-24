import { db } from '@/lib/db';
import { handleExt } from '@/lib/campus/ext';

// The Loopd extension's lookup (openspec loopd-browser-extension, design D8).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleExt(db(), request, 'look'); }
