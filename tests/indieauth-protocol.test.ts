import { describe, expect, test } from 'bun:test';
import { createIndieAuthHandler } from '../src/lib/server/indieauth/protocol';
import { validateClient } from '../src/lib/server/indieauth/clients';
import type { PublicFetcher } from '../src/lib/server/publishing/public-fetch';
import type { AuthRPC, IndieAuthEnvironment } from '../src/lib/server/indieauth/contracts';
const origin='https://example.com';
function fixture(overrides:Record<string,unknown>={}, publicFetch?:PublicFetcher, assets?:IndieAuthEnvironment['ASSETS']){
 const calls:{op:string;input:any}[]=[];
 const store={invoke:async(op:string,input:any)=>{calls.push({op,input});if(op==='rateLimit')return true;if(op==='createRequest')return {id:'pending'};if(op==='session')return {csrf:'proof',expiresAt:100000};if(op==='status')return {credentialCount:1,setupAvailable:false};if(op==='authenticationVerify')return {sessionToken:'secret',csrf:'proof',expiresAt:100000};if(op==='exchangeCode')return {access_token:'token',me:origin+'/',scope:'profile',token_type:'Bearer',expires_in:300};if(op==='introspectToken')return {active:false};if(op in overrides)return overrides[op];return true;}} as AuthRPC;
 const env={AUTH_ENABLED:'true',AUTH_ORIGIN:origin,AUTH_ME:origin+'/',AUTH_STORE:{} as DurableObjectNamespace,AUTH_INTROSPECTION_TOKEN:'introspection-secret',ASSETS:assets} satisfies IndieAuthEnvironment;
 return {calls,handler:createIndieAuthHandler(env,{store,publicFetch,now:()=>0})};
}
function post(path:string,data:unknown,headers:Record<string,string>={}){return new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:typeof data==='string'?data:JSON.stringify(data)});}
describe('IndieAuth protocol boundary',()=>{
 test('personal token creation forwards optional trimmed names',async()=>{
  for(const name of ['  Laptop publishing  ', '', undefined]){
   const {handler,calls}=fixture();
   const response=await handler(post('/auth/tokens',{scope:['create','media'],csrf:'proof',name},{cookie:'__Host-indieauth-session=owner'}));
   expect(response.status).toBe(200);
   expect(calls.find(c=>c.op==='personalToken')?.input).toEqual({session:'owner',csrf:'proof',scope:['create','media'],name:name?.trim()||undefined});
  }
 });
 test('invalid token names are rejected before invoking the store',async()=>{
  for(const name of ['x'.repeat(101),null,42,['name'],{}]){
   const {handler,calls}=fixture();
   expect((await handler(post('/auth/tokens',{scope:['read'],csrf:'proof',name},{cookie:'__Host-indieauth-session=owner'}))).status).toBe(400);
   expect(calls.some(c=>c.op==='personalToken')).toBe(false);
  }
 });
 test('metadata has public CORS while owner APIs do not',async()=>{const {handler}=fixture();for(const method of ['GET','OPTIONS']){const response=await handler(new Request(origin+'/.well-known/oauth-authorization-server',{method}));expect(response.status).toBe(method==='GET'?200:204);expect(response.headers.get('access-control-allow-origin')).toBe('*');}expect((await handler(new Request(origin+'/auth/session'))).headers.has('access-control-allow-origin')).toBe(false);expect((await handler(new Request(origin+'/auth/session',{method:'OPTIONS'}))).status).toBe(405);});
 test('normalizes optional owner me URL',async()=>{const {handler}=fixture();const base=origin+'/auth?response_type=code&client_id=https://client.example/&redirect_uri=https://client.example/cb&state=s&code_challenge_method=S256&code_challenge='+ 'a'.repeat(43);expect((await handler(new Request(base+'&me='+encodeURIComponent(origin)))).status).toBe(303);expect((await handler(new Request(base+'&me=https%3A%2F%2Fevil.example'))).status).toBe(400);});
 test('consent callback identifies issuer',async()=>{const {handler}=fixture({approveRequest:{code:'code',redirectUri:'https://client.example/cb',state:'state'}});const response=await handler(post('/auth/consent',{id:'request',scope:['profile'],csrf:'proof'},{cookie:'__Host-indieauth-session=owner'}));const redirect=new URL((await response.json() as {redirect: string}).redirect);expect(redirect.searchParams.get('iss')).toBe(origin+'/');expect(redirect.searchParams.get('code')).toBe('code');expect(redirect.searchParams.get('state')).toBe('state');});
 test('requires PKCE, state and known scopes without redirecting invalid requests',async()=>{for(const suffix of ['', '&state=s&code_challenge_method=S256&code_challenge='+ 'a'.repeat(43)+'&scope=admin']){const {handler,calls}=fixture();const response=await handler(new Request(origin+'/auth?response_type=code&client_id=https://client.example/&redirect_uri=https://client.example/cb'+suffix));expect(response.status).toBe(400);expect(response.headers.has('location')).toBe(false);expect(calls.some(c=>c.op==='createRequest')).toBe(false);}});
 test('stores validated consent request then redirects locally',async()=>{const {handler,calls}=fixture();const response=await handler(new Request(origin+'/auth?response_type=code&client_id=https://client.example/&redirect_uri=https://client.example/cb&state=s&code_challenge_method=S256&code_challenge='+ 'a'.repeat(43)+'&scope=create'));expect(response.status).toBe(303);expect(response.headers.get('location')).toBe(origin+'/account?request=pending');expect(calls.find(c=>c.op==='createRequest')?.input.scope).toEqual(['create']);});
 test('rejects duplicate form fields and ignores cookie for token authorization',async()=>{const {handler,calls}=fixture();const response=await handler(post('/auth/token','code=a&code=b',{'content-type':'application/x-www-form-urlencoded',cookie:'__Host-indieauth-session=owner'}));expect(response.status).toBe(400);expect(response.headers.get('access-control-allow-origin')).toBe('*');expect(calls.some(c=>c.op==='exchangeCode')).toBe(false);});
 test('owner writes reject foreign origins and require CSRF',async()=>{const {handler}=fixture();expect((await handler(post('/auth/tokens',{scope:['read'],csrf:'p'},{origin:'https://evil.example'}))).status).toBe(403);expect((await handler(post('/auth/tokens',{scope:['read']},{cookie:'__Host-indieauth-session=owner'}))).status).toBe(400);});
 test('login sets secure cookie without returning secret',async()=>{const {handler}=fixture();const response=await handler(post('/auth/passkey/login/verify',{id:'challenge',response:{}}));expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('__Host-indieauth-session=secret; Path=/; HttpOnly; Secure; SameSite=Lax');expect(await response.text()).not.toContain('secret');expect(response.headers.has('access-control-allow-origin')).toBe(false);});
 test('introspection requires separate bearer credential',async()=>{const {handler}=fixture();const no=await handler(post('/auth/introspect','token=x',{'content-type':'application/x-www-form-urlencoded'}));expect(no.status).toBe(401);const yes=await handler(post('/auth/introspect','token=x',{'content-type':'application/x-www-form-urlencoded',authorization:'Bearer introspection-secret'}));expect(await yes.json()).toEqual({active:false});});
 test('legacy identity verification revokes newly minted token',async()=>{const {handler,calls}=fixture();const response=await handler(post('/auth','code=x&client_id=https%3A%2F%2Fclient.example&redirect_uri=https%3A%2F%2Fclient.example%2Fcb&code_verifier=v',{'content-type':'application/x-www-form-urlencoded'}));expect(response.status).toBe(200);expect(calls.find(c=>c.op==='revokeToken')?.input.token).toBe('token');});
});
describe('client redirect verification',()=>{
 test('loopback clients stay same-origin without fetching',async()=>{let fetched=false;await validateClient('http://127.0.0.1:8000/','http://127.0.0.1:8000/cb',async()=>{fetched=true;throw Error();});expect(fetched).toBe(false);await expect(validateClient('http://127.0.0.1:8000/','https://other.example/')).rejects.toThrow('invalid_redirect_uri');});
 test('cross-origin requires declared exact redirect',async()=>{await validateClient('https://client.example/','https://callback.example/',async()=>new Response(JSON.stringify({client_id:'https://client.example/',redirect_uris:['https://callback.example/']}),{headers:{'content-type':'application/json'}}));await expect(validateClient('https://client.example/','https://callback.example/',async()=>new Response('<a rel="redirect_uri" href="https://wrong.example/">'))).rejects.toThrow('invalid_redirect_uri');});
});

const nativeClient = 'https://client.example/ios';
const nativeCallback = 'com.example.quill:/oauth/callback?platform=ios';
function nativeMetadata(callbacks = [nativeCallback]) {
 return async () => new Response(JSON.stringify({client_id:nativeClient, client_name:'Quill for iOS', redirect_uris:callbacks}), {headers:{'content-type':'application/json'}});
}
describe('native app callbacks', () => {
 test('same-site client metadata uses the public asset binding and still verifies the callback', async () => {
  const html = await Bun.file(new URL('../static/clients/quill-native/index.html', import.meta.url)).text();
  let fetched = 0;
  const {handler,calls} = fixture({}, undefined, {fetch: async (input) => {
   expect(new Request(input).url).toBe(origin+'/clients/quill-native/');
   fetched++;
   return new Response(html, {headers:{'content-type':'text/html'}});
  }});
  for (const [redirect_uri,status] of [['quill-native://oauth',303],['quill-native://other',400]] as const) {
   const params = new URLSearchParams({response_type:'code',client_id:origin+'/clients/quill-native/',redirect_uri,state:'s',code_challenge_method:'S256',code_challenge:'a'.repeat(43)});
   expect((await handler(new Request(origin+'/auth?'+params))).status).toBe(status);
  }
  expect(fetched).toBe(2);
  expect(calls.filter(c => c.op === 'createRequest')).toHaveLength(1);
 });
 test('Quill Native client page registers only its app callback', async () => {
  const html = await Bun.file(new URL('../static/clients/quill-native/index.html', import.meta.url)).text();
  const fetcher = async () => new Response(html, {headers:{'content-type':'text/html'}});
  await validateClient('https://caseyagollan.com/clients/quill-native/', 'quill-native://oauth', fetcher);
  await expect(validateClient('https://caseyagollan.com/clients/quill-native/', 'quill-native://other', fetcher)).rejects.toThrow('invalid_redirect_uri');
 });
 test('accepts exact custom callbacks declared in JSON and HTML metadata', async () => {
  for (const callback of [nativeCallback, 'quill://auth/callback']) {
   expect(await validateClient(nativeClient, callback, nativeMetadata([callback]))).toEqual({clientName:'Quill for iOS'});
   await validateClient(nativeClient, callback, async () => new Response(`<link rel="redirect_uri" href="${callback}">`));
  }
 });
 test('requires exact registration and an HTTPS client identity', async () => {
  for (const callback of [nativeCallback+'x', nativeCallback.replace('/callback', '/other'), 'quill://auth/callback']) {
   await expect(validateClient(nativeClient, callback, nativeMetadata())).rejects.toThrow('invalid_redirect_uri');
  }
  await expect(validateClient('http://127.0.0.1:8000/', nativeCallback, nativeMetadata())).rejects.toThrow('invalid_redirect_uri');
  await expect(validateClient('quill://client/', nativeCallback, nativeMetadata())).rejects.toThrow('invalid_client');
 });
 test('rejects unsafe callbacks even when declared', async () => {
  for (const callback of ['javascript:alert(1)', 'javascript://host/callback', 'data:text/html,hello', 'file:///etc/passwd', 'blob:https://client.example/id', 'about:blank', 'ftp://client.example/cb', 'quill:opaque', 'quill://user:pass@auth/cb', nativeCallback+'#fragment', 'quill://auth/call\nback', 'http://client.example/cb', 'not a URL']) {
   await expect(validateClient(nativeClient, callback, nativeMetadata([callback]))).rejects.toThrow('invalid_redirect_uri');
  }
 });
 test('authorizes native callbacks, preserves query and state, and exchanges the exact URI', async () => {
  const {handler,calls} = fixture({approveRequest:{code:'native-code',redirectUri:nativeCallback,state:'ios state'}}, nativeMetadata());
  const params = new URLSearchParams({response_type:'code',client_id:nativeClient,redirect_uri:nativeCallback,state:'ios state',scope:'create',code_challenge_method:'S256',code_challenge:'a'.repeat(43)});
  const response = await handler(new Request(origin+'/auth?'+params));
  expect(response.status).toBe(303);
  expect(calls.find(c => c.op === 'createRequest')?.input).toMatchObject({clientId:nativeClient,redirectUri:nativeCallback,state:'ios state',scope:['create']});
  const consent = await handler(post('/auth/consent',{id:'pending',scope:['create'],csrf:'proof'},{cookie:'__Host-indieauth-session=owner'}));
  const target = new URL((await consent.json() as {redirect:string}).redirect);
  expect(target.protocol).toBe('com.example.quill:');
  expect(target.pathname).toBe('/oauth/callback');
  expect(Object.fromEntries(target.searchParams)).toEqual({platform:'ios',code:'native-code',iss:origin+'/',state:'ios state'});
  const exchange = await handler(post('/auth/token',new URLSearchParams({grant_type:'authorization_code',code:'native-code',client_id:nativeClient,redirect_uri:nativeCallback,code_verifier:'a'.repeat(43)}).toString(),{'content-type':'application/x-www-form-urlencoded'}));
  expect(exchange.status).toBe(200);
  expect(calls.find(c => c.op === 'exchangeCode')?.input.redirectUri).toBe(nativeCallback);
 });
 test('unregistered callbacks never create a request or redirect', async () => {
  const {handler,calls} = fixture({},nativeMetadata([]));
  const params = new URLSearchParams({response_type:'code',client_id:nativeClient,redirect_uri:nativeCallback,state:'s',code_challenge_method:'S256',code_challenge:'a'.repeat(43)});
  const response = await handler(new Request(origin+'/auth?'+params));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({error:'invalid_redirect_uri'});
  expect(response.headers.has('location')).toBe(false);
  expect(calls.some(c => c.op === 'createRequest')).toBe(false);
 });
});
