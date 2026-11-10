import { handleTeamMcpRequest } from '@/lib/emba/team-mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handleTeamMcpRequest(request); }
export async function GET(request: Request) { return handleTeamMcpRequest(request); }
export async function DELETE(request: Request) { return handleTeamMcpRequest(request); }
