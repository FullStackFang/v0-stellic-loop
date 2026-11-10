import { handleMemoryRequest } from '@/lib/emba/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleMemoryRequest(request); }
