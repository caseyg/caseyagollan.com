/** Real local workerd+SQLite DO+WebAuthn test. No account credentials or remote sends. */
import { Miniflare } from 'miniflare';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createTestAuthenticator } from '../tests/helpers/webauthn';
const dir = await mkdtemp(join(tmpdir(),'indieauth-runtime-'));
let runtime: Miniflare | undefined;
try {
 const entry = join(dir,'worker.ts');
 await writeFile(entry, `
 import { createIndieAuthHandler } from ${JSON.stringify(resolve('src/lib/server/indieauth/protocol.ts'))};
 import { publishingConfig } from ${JSON.stringify(resolve('src/lib/server/publishing/config.ts'))};
 import { createMicropubHandler } from ${JSON.stringify(resolve('src/lib/server/publishing/micropub.ts'))};
 import { createMediaHandler, serveMedia } from ${JSON.stringify(resolve('src/lib/server/publishing/media.ts'))};
 export { IndieAuthStore } from ${JSON.stringify(resolve('src/lib/server/indieauth/store.ts'))};
 const files = new Map(); let head=0;
 const gitFetch = async (url,init) => {
  if(url.includes('/git/ref/')) return Response.json({object:{sha:'head-'+head}});
  if(url==='https://api.github.com/graphql') {
   const input=JSON.parse(init.body).variables.input;
   if(input.expectedHeadOid!=='head-'+head) return Response.json({errors:[{type:'STALE_DATA'}]});
   for(const file of input.fileChanges.additions) files.set(file.path,{content:file.contents,sha:'revision-'+(head+1)});
   return Response.json({data:{createCommitOnBranch:{commit:{oid:'commit-'+(++head)}}}});
  }
  const path=decodeURIComponent(new URL(url).pathname.split('/contents/')[1]); const file=files.get(path);
  return file?Response.json({type:'file',path,sha:file.sha,content:file.content,encoding:'base64'}):new Response(null,{status:404});
 };
 export default {async fetch(request,env) {
  // Miniflare dispatch routes through its HTTP loopback listener. Simulate the
  // edge's configured HTTPS authority in this test-only entrypoint.
  const incoming=new URL(request.url);
  request=new Request(new URL(incoming.pathname+incoming.search,env.AUTH_ORIGIN),request);
  request.headers.set('host',new URL(env.AUTH_ORIGIN).host);
  const path=new URL(request.url).pathname;
  if(path==='/micropub') return createMicropubHandler(publishingConfig(env),{fetcher:gitFetch})(request);
  if(path==='/micropub/media') return createMediaHandler(publishingConfig(env),env.PUBLISHING_MEDIA)(request);
  if(path.startsWith('/media/')) return serveMedia(request,path.slice(7),env.PUBLISHING_MEDIA);
  const response=await createIndieAuthHandler(env)(request);
  // Bun's Miniflare/undici bridge follows 303 despite redirect:manual. Preserve
  // the real protocol result as a test-only header; unit/browser tests cover303.
  if(response.status===303) {const headers=new Headers(response.headers);headers.set('x-test-original-status','303');return new Response(null,{status:200,headers});}
  return response;
 }};
 `);
 const bundle=await Bun.build({entrypoints:[entry],target:'browser',external:['cloudflare:workers']});
 if(!bundle.success) throw new Error(bundle.logs.map(String).join('\n'));
 const origin='https://auth.example.org';
 runtime=new Miniflare({modules:true,compatibilityDate:'2025-01-19',script:await bundle.outputs[0].text(),durableObjects:{AUTH_STORE:{className:'IndieAuthStore',useSQLite:true}},r2Buckets:['PUBLISHING_MEDIA'],bindings:{AUTH_ENABLED:'true',AUTH_ORIGIN:origin+'/',AUTH_ME:'https://example.com/',AUTH_SETUP_TOKEN:'test-only-bootstrap-not-an-account-secret',AUTH_INTROSPECTION_TOKEN:'test-only-server-credential',PUBLISHING_ENABLED:'true',PUBLISHING_AUTH_MODE:'internal',PUBLISHING_ME:'https://example.com/',PUBLISHING_GITHUB_OWNER:'caseyg',PUBLISHING_GITHUB_REPO:'content',PUBLISHING_GITHUB_BRANCH:'test',PUBLISHING_GITHUB_TOKEN:'test-only-git',PUBLISHING_TIMEZONE:'America/New_York'}});
 const worker = await runtime.getWorker();
 const json=async(path:string,body:unknown,cookie?:string)=>worker.fetch(origin+path,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const form=async(path:string,body:Record<string,string>,authorization?:string)=>worker.fetch(origin+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',...(authorization?{Authorization:'Bearer '+authorization}:{})},body:new URLSearchParams(body).toString()});
 const metadata=await worker.fetch(origin+'/.well-known/oauth-authorization-server');assert.equal(metadata.status,200,'metadata');assert.equal((await metadata.json() as any).issuer,origin+'/');
 const authenticator=await createTestAuthenticator('auth.example.org',origin);
 const options=await json('/auth/passkey/register/options',{setupToken:'test-only-bootstrap-not-an-account-secret'});assert.equal(options.status,200,'registration options');const registration=await options.json() as any;
 const registered=await json('/auth/passkey/register/verify',{setupToken:'test-only-bootstrap-not-an-account-secret',id:registration.id,response:await authenticator.registration(registration.options)});assert.equal(registered.status,200,'real registration verification');
 let cookie=registered.headers.get('set-cookie')!.split(';')[0]; let session=await registered.json() as any;
 assert.equal((await json('/auth/passkey/register/options',{setupToken:'test-only-bootstrap-not-an-account-secret'})).status,403,'bootstrap closes');
 const verifier='v'.repeat(64);const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
 const client='https://client.example.org/'; const redirect='https://client.example.org/callback';
 const authorize=await worker.fetch(origin+'/auth?'+new URLSearchParams({response_type:'code',client_id:client,redirect_uri:redirect,state:'state-proof',scope:'create update delete draft media',code_challenge:challenge,code_challenge_method:'S256'}),{redirect:'manual'});assert.equal(authorize.headers.get('x-test-original-status'),'303','authorization request');
 const id=new URL(authorize.headers.get('location')!).searchParams.get('request');
 const consent=await json('/auth/consent',{id,scope:['create','update','delete','draft','media'],csrf:session.csrf},cookie);assert.equal(consent.status,200,'consent');const callback=new URL((await consent.json() as any).redirect);assert.equal(callback.searchParams.get('state'),'state-proof');assert.equal(callback.searchParams.get('iss'),origin+'/');
 const grant={grant_type:'authorization_code',code:callback.searchParams.get('code')!,client_id:client,redirect_uri:redirect,code_verifier:verifier};
 const exchanged=await Promise.all([form('/auth/token',grant),form('/auth/token',grant)]);assert.deepEqual(exchanged.map(r=>r.status).sort(),[200,400],'single use exchange under concurrent requests');
 const token=await exchanged.find(r=>r.status===200)!.json() as any;assert.equal(token.token_type,'Bearer');assert.equal(token.access_token.length,43);
 const introspection=await form('/auth/introspect',{token:token.access_token},'test-only-server-credential');assert.equal(introspection.status,200);assert.equal((await introspection.json() as any).active,true);
 assert.equal((await form('/auth/introspect',{token:token.access_token})).status,401,'introspection is authenticated');
 const config=await worker.fetch(origin+'/micropub?q=config',{headers:{Authorization:'Bearer '+token.access_token}});assert.equal(config.status,200,'native token authorizes resource without network');
 const saved=await worker.fetch(origin+'/micropub',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({properties:{content:['Native auth proof'],'mp-slug':['native-auth-proof']}})});assert.equal(saved.status,202,'native token publishes');
 const draft=await worker.fetch(origin+'/micropub',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({properties:{content:['Draft proof'],'post-status':['draft'],'mp-slug':['native-auth-draft']}})});assert.equal(draft.status,202,'native token saves draft');
 const uploadForm=new FormData();uploadForm.append('file',new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'}),'proof.png');const uploadRequest=new Request(origin+'/micropub/media',{method:'POST',body:uploadForm});
 const upload=await worker.fetch(uploadRequest.url,{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':uploadRequest.headers.get('content-type')!},body:await uploadRequest.arrayBuffer()});assert.equal(upload.status,201,'native token authorizes real R2 upload');
 assert.equal((await form('/auth/revoke',{token:token.access_token})).status,200);
 assert.equal((await worker.fetch(origin+'/micropub?q=config',{headers:{Authorization:'Bearer '+token.access_token}})).status,401,'revocation immediately blocks resource');
 assert.equal((await json('/auth/logout',{csrf:session.csrf},cookie)).status,200);
 assert.equal((await (await worker.fetch(origin+'/auth/session',{headers:{Cookie:cookie}})).json() as any).authenticated,false,'logout invalidates cookie');
 const loginOptions=await json('/auth/passkey/login/options',{});const login=await loginOptions.json() as any;
 const signed=await json('/auth/passkey/login/verify',{id:login.id,response:await authenticator.authentication(login.options)});assert.equal(signed.status,200,'real signed passkey login');
 console.log('PASS: real workerd SQLite DO, ES256 passkey enrollment/login, bootstrap closure, consent, PKCE concurrent replay prevention, protected introspection, native Micropub/draft/media and revocation');
} finally {await runtime?.dispose();await rm(dir,{recursive:true,force:true});}
