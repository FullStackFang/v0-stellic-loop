import {db} from '@/lib/db';
import {getPortalPrincipal} from '@/lib/emba/portal-session';
import {isOperator,metricsCsv,pilotMetrics} from '@/lib/emba/pilot-metrics';

// The per-group numbers as a file, for the operator only. Anyone else gets the same answer as for a page that does not exist.
export async function GET() {
  const principal=await getPortalPrincipal().catch(()=>null);
  if(!isOperator(principal))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  return new Response(metricsCsv(await pilotMetrics(db(),principal)),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="loop-pilot-numbers.csv"','Cache-Control':'no-store'}});
}
