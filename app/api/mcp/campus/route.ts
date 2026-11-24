import { handleCampusMcpRequest } from '@/lib/campus/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handleCampusMcpRequest(request); }
export async function GET(request: Request) { return handleCampusMcpRequest(request); }
export async function DELETE(request: Request) { return handleCampusMcpRequest(request); }
