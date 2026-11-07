import 'server-only';
import { z } from 'zod';
import { commitmentSchema, activityPublicationSchema } from '@/lib/emba/activities';
import { disclosureSchema } from '@/lib/emba/disclosure';

const base = {clientId:z.string().min(1).max(200),targetId:z.uuid(),expectedVersion:z.number().int().positive()};
const reviewSchema = z.discriminatedUnion('action',[
  z.strictObject({...base,action:z.literal('commitment'),payload:commitmentSchema}),
  z.strictObject({...base,action:z.literal('identity_disclosure'),payload:disclosureSchema}),
  z.strictObject({...base,action:z.literal('publication'),expectedVersion:z.literal(1),payload:activityPublicationSchema}),
]).refine(v=>v.payload.activityId===v.targetId && (v.action==='publication' || v.payload.revision===v.expectedVersion));

export function parseReview(input: string) {
  z.string().max(32768).parse(input);
  return reviewSchema.parse(JSON.parse(input));
}
