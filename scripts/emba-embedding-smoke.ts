// Opt-in live test. Inputs are fixed synthetic text, never application records.
import {embedMany} from 'ai';

async function main() {
if(process.env.EMBA_EMBEDDING_SMOKE!=='1')throw new Error('Set EMBA_EMBEDDING_SMOKE=1 to authorize the synthetic live request');
try {
  const result=await embedMany({
    model:'openai/text-embedding-3-small',dimensions:1536,
    values:['The hotel bus leaves at nine in the morning.','When does the morning hotel shuttle depart?'],
    providerOptions:{gateway:{zeroDataRetention:true}},
    maxRetries:0,abortSignal:AbortSignal.timeout(20000),
    telemetry:{isEnabled:false,recordInputs:false,recordOutputs:false},
  });
  if(result.embeddings.length!==2||result.embeddings.some(v=>v.length!==1536||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid embedding shape');
  console.log(JSON.stringify({status:'passed',model:'openai/text-embedding-3-small',vectors:2,dimensions:1536,tokens:result.usage.tokens,zdrRequested:true,metadataKeys:Object.keys(result.providerMetadata??{})}));
} catch(error) {
  // Never print provider errors: SDK errors can carry request bodies/headers.
  const status=error&&typeof error==='object'&&'statusCode' in error?error.statusCode:undefined;
  const message=error instanceof Error?error.message.toLowerCase():'';
  const reasons=['credit','budget','verification','oidc','zero data retention','permission'].filter(category=>message.includes(category));
  console.error(JSON.stringify({status:'unavailable',httpStatus:typeof status==='number'?status:null,reasons}));
  process.exitCode=1;
}
}
void main();
