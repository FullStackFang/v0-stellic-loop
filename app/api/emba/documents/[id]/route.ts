import {handleDocumentRequest} from '@/lib/emba/mcp';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  return handleDocumentRequest(request,(await params).id);
}
