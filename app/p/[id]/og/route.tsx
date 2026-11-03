import { db } from "@/lib/db";
import { boardById, boardData, proposalById } from "@/lib/load";
import { proposalImage } from "@/lib/og";
import { planModel } from "@/lib/view";
import { forecast } from "@/lib/forecast";
export async function GET(_req: Request, { params }: { params: Promise<{id:string}> }) {
 const q=db(),p=await proposalById(q,(await params).id);if(!p)return new Response('Not found',{status:404});
 const board=(await boardById(q,p.board_id))!,c=planModel(p,await boardData(q,board),null);
 Object.assign(c,await forecast(board,c.day));
 return proposalImage(c,board.name,{headers:{'Cache-Control':'no-store, max-age=0'}});
}
