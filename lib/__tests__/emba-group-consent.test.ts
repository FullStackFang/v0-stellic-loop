import {expect,it} from 'vitest';
import {leaseSchema} from '@/lib/emba/consent';
const scope={orgId:'11111111-1111-4111-8111-111111111111',loopId:'22222222-2222-4222-8222-222222222222'};
it('requires an explicit group-scoped write grant without broadening old actions',()=>{
 const base={clientId:'assistant',expiresAt:'2099-01-01T00:00:00Z',...scope};
 expect(leaseSchema.parse({...base,actions:['group-memory:write']})).toMatchObject({actions:['group-memory:write'],...scope});
 expect(leaseSchema.parse({...base,actions:['plan:read']})).toMatchObject({actions:['plan:read']});
 expect(()=>leaseSchema.parse({...base,orgId:null,loopId:null,actions:['group-memory:write']})).toThrow();
 expect(()=>leaseSchema.parse({...base,actions:['group-memory:admin']})).toThrow();
});
