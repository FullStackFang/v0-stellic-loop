import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { YourWeek } from "@/components/YourWeek";
import { db } from "@/lib/db";
import { boardBySlug, boardData } from "@/lib/load";
import { planModel } from "@/lib/view";
import { forecast } from "@/lib/forecast";
import { viewer } from "@/lib/viewer";
export default async function YouPage({ params }: { params: Promise<{slug:string}> }) {
 const q=db(),board=await boardBySlug(q,(await params).slug);if(!board)notFound();
 const me=await viewer(q);const data=me?await boardData(q,board):null;
 const membership=me?(await q.query<{share_with_steward:boolean}>("select share_with_steward from board_person where board_id = $1 and person_id = $2",[board.id,me.id])).rows[0]:null;
 const plans=data?await Promise.all(data.proposals.map(async p=>{const c=planModel(p,data,me);return {...c,...await forecast(board,c.day)};})):[];
 return <Shell board={board} tab="you"><YourWeek board={board} me={me} plans={plans} share={membership?.share_with_steward??false}/></Shell>;
}
