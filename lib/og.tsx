import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { solar } from "./solar";
import type { PlanModel } from "./view";
export const OG_SIZE = {width:1200,height:630};
const font = readFile(join(process.cwd(), "public/fonts/Archivo-Black.ttf"));
async function fonts() { return [{name:"Archivo",data:await font,weight:900 as const,style:"normal" as const}]; }
export async function proposalImage(plan: PlanModel, board: string, init?: ResponseInit) {
 const light=solar(plan.hour,plan.sky), ended=plan.state==='didnt_form'||plan.state==='closed';
 return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',padding:64,background:ended?'#dcd7cc':light.tint,color:ended?'#1a1612':light.fg,fontFamily:'Archivo',fontWeight:900}}>
  <div style={{display:'flex',fontSize:26,justifyContent:'space-between'}}><span>Loop</span><span>{board}</span></div>
  <div style={{display:'flex',fontSize:80,lineHeight:1,marginTop:45}}>{plan.title.toUpperCase()}</div>
  <div style={{display:'flex',fontSize:120,marginTop:28}}>{plan.count} of {plan.threshold}</div>
  <div style={{display:'flex',fontSize:30,marginTop:20}}>{plan.state==='didnt_form'?"Didn't form":plan.state==='formed'?'Formed':plan.state==='past'?'Happened':plan.state==='closed'?'Closed':'Open'}</div>
 </div>,{...OG_SIZE,fonts:await fonts(),...init});
}
export async function boardImage(name:string) {
 return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',padding:96,color:'#1a1612',background:'#fffdf7',fontFamily:'Archivo',fontWeight:900}}><div style={{display:'flex',fontSize:32}}>Loop</div><div style={{display:'flex',fontSize:100,lineHeight:1,marginTop:32}}>{name.toUpperCase()}</div></div>,{...OG_SIZE,fonts:await fonts()});
}
