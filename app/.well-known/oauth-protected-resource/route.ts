import { protectedResourceMetadata } from '@/lib/emba/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return protectedResourceMetadata(); }
