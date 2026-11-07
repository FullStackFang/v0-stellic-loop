// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {createClerkTokenVerifier} from '@/lib/emba/clerk-token';
import {authConfig,configuredAuth} from '@/lib/emba/auth-token';
import {authenticate} from '@/lib/emba/access';
import {makePerson,openTestDb,type TestDb} from '@/test/db';

const sdk=vi.hoisted(()=>({verify:vi.fn(),create:vi.fn()}));
vi.mock('@clerk/nextjs/server',()=>({createClerkClient:sdk.create}));
const issuer='https://test-cohort.clerk.accounts.dev';
const env={LOOP_AUTH_ISSUER:issuer,LOOP_AUTH_AUDIENCE:'https://loop.example/api/mcp',LOOP_AUTH_JWKS_URL:`${issuer}/.well-known/jwks.json`,LOOP_AUTH_CLIENT_IDS:'client_approved'};
const config=authConfig(env);
const subject='user_2xhFjEI5X2qWRvtV13BzSj8H6Dk';
function valid(){return {id:'oat_0ef5a7a33d87ed87ee7954c845d80450',clientId:'client_approved',type:'oauth_token',subject,scopes:['plan:read'],revoked:false,revocationReason:null,expired:false,expiration:Math.floor(Date.now()/1000)+3600,createdAt:Math.floor(Date.now()/1000),updatedAt:Math.floor(Date.now()/1000),aud:[config.audience]};}
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{
 await t.reset();sdk.create.mockReturnValue({idPOAuthAccessToken:{verify:sdk.verify}});sdk.verify.mockResolvedValue(valid());
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 vi.stubEnv('CLERK_SECRET_KEY','sk_test_synthetic');vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',`pk_test_${Buffer.from('test-cohort.clerk.accounts.dev$').toString('base64')}`);
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('uses online SDK verification with exact audience and projects only delegated identity fields',async()=>{
 const tokenClaims=valid();sdk.verify.mockResolvedValue(tokenClaims);
 const verify=createClerkTokenVerifier(config),result=await verify('opaque-test-token');
 expect(sdk.verify).toHaveBeenCalledWith('opaque-test-token',{audience:config.audience});
 expect(result).toEqual({issuer,subject,clientId:'client_approved',scopes:['plan:read'],expiresAt:tokenClaims.expiration*1000});
 expect(result).not.toHaveProperty('verifiedEmail');
 sdk.verify.mockResolvedValue({...valid(),email:'attacker@example.com',email_verified:true,organization_id:'org_fake'});
 expect(await verify('opaque-test-token')).not.toHaveProperty('verifiedEmail');
});
it('rejects expired/revoked/unbounded or malformed claims and audience/client substitutions',async()=>{
 const verify=createClerkTokenVerifier(config);
 for(const changes of [{revoked:true},{expired:true},{revoked:undefined},{expiration:null},{expiration:1},{expiration:Infinity},{expiration:1.5},{expiration:Number.MAX_SAFE_INTEGER},{aud:[]},{aud:[config.audience,'https://other.example']},{aud:['https://other.example']},{aud:config.audience},{clientId:'unapproved'},{clientId:null},{subject:''},{subject:'user_ with space'},{subject:'org_2xhFjEI5X2qWRvtV13BzSj8H6Dk'},{scopes:'plan:read'},{scopes:[1]}]){
  sdk.verify.mockResolvedValue({...valid(),...changes});expect(await verify('opaque-test-token')).toBeNull();
 }
 sdk.verify.mockResolvedValue({active:false});expect(await verify('expired-jwt')).toBeNull();
 sdk.verify.mockRejectedValue(new Error('TOKEN_SECRET_CANARY'));expect(await verify('invalid')).toBeNull();
});
it('fails closed for missing secrets, issuer mismatch and changed provider configuration',async()=>{
 const verify=createClerkTokenVerifier(config);
 vi.stubEnv('CLERK_SECRET_KEY','');expect(await verify('token')).toBeNull();expect(sdk.verify).not.toHaveBeenCalled();
 vi.stubEnv('CLERK_SECRET_KEY','sk_test_synthetic');
 expect(await createClerkTokenVerifier({...config,issuer:'https://wrong.example'})('token')).toBeNull();expect(sdk.verify).not.toHaveBeenCalled();
 vi.stubEnv('LOOP_AUTH_PROVIDER','clerk');expect(await configuredAuth().verify('token')).toMatchObject({subject});
 vi.stubEnv('LOOP_AUTH_PROVIDER','');expect(await configuredAuth().verify('not-a-jwt')).toBeNull();expect(sdk.verify).toHaveBeenCalledTimes(1);
});
it('never provisions a remote subject and requires the existing verified mapping on every call',async()=>{
 const verify=createClerkTokenVerifier(config);
 expect(await authenticate(t.db,'opaque-test-token',verify)).toBeNull();
 expect((await t.db.query('select * from emba_identity')).rows).toEqual([]);
 const person=await makePerson(t.db);
 await t.db.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())',[issuer,subject,person.id]);
 expect(await authenticate(t.db,'opaque-test-token',verify)).toMatchObject({personId:person.id,clientId:'client_approved',verifiedEmail:null});
 await t.db.query('update emba_identity set revoked_at=now() where person_id=$1',[person.id]);
 expect(await authenticate(t.db,'opaque-test-token',verify)).toBeNull();
 expect(sdk.verify).toHaveBeenCalledTimes(3);
});
