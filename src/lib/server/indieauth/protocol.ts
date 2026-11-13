import { AUTH_ERRORS, AUTH_SCOPES, authError, authSettings, authStore, tokenName, type AuthRPC, type IndieAuthEnvironment } from './contracts';
import { validateClient } from './clients';
import type { PublicFetcher } from '../publishing/public-fetch';
const COOKIE = '__Host-indieauth-session';
function scalar(value: unknown, max = 4096): string { if (typeof value !== 'string' || !value.length || value.length > max) authError('invalid_request'); return value; }
function scopes(value: unknown): string[] { const list = typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : value; if (!Array.isArray(list) || list.some(s => typeof s !== 'string' || !(AUTH_SCOPES as readonly string[]).includes(s))) authError('invalid_scope'); return [...new Set(list)] as string[]; }
async function digest(value: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
async function equal(a: string, b: string) { const [x,y] = await Promise.all([digest(a),digest(b)]); let difference=0; for(let i=0;i<x.length;i++) difference |= x[i]^y[i]; return difference===0; }
function uniqueJsonKeys(text: string) {
 const stack: (Set<string> | null)[] = [];
 for (let i=0;i<text.length;i++) {
  const ch=text[i];
  if(ch==='"') { const start=i++; for(;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"')break;} const raw=text.slice(start,i+1);let next=i+1;while(/\s/.test(text[next]??'')&&next<text.length)next++;if(text[next]===':'){const keys=stack[stack.length-1];if(!keys)authError('invalid_request');const key=JSON.parse(raw);if(keys.has(key))authError('invalid_request');keys.add(key);} }
  else if(ch==='{')stack.push(new Set());else if(ch==='[')stack.push(null);else if(ch==='}'||ch===']')stack.pop();
 }
}
async function body(request: Request, json: boolean): Promise<Record<string, unknown>> {
 if (Number(request.headers.get('content-length')) > 65536) authError('invalid_request');
 const reader=request.body?.getReader(); const chunks:Uint8Array[]=[];let size=0;
 if(reader) while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();authError('invalid_request');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;} const text=new TextDecoder().decode(bytes);
 if(json) { if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') authError('invalid_request'); try {uniqueJsonKeys(text);const data=JSON.parse(text);if(!data || typeof data!=='object'||Array.isArray(data))authError('invalid_request');return data;}catch{authError('invalid_request');} }
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')authError('invalid_request');
 return parameters(new URLSearchParams(text));
}
function parameters(params:URLSearchParams):Record<string,string> {const data:Record<string,string>=Object.create(null); for(const [k,v] of params){if(Object.hasOwn(data,k)||k.length>100||v.length>8192)authError('invalid_request');data[k]=v;}return data;}
export function createIndieAuthHandler(env: IndieAuthEnvironment, dependencies: {store?:AuthRPC;publicFetch?:PublicFetcher;now?:()=>number} = {}) {
 return async (request:Request):Promise<Response> => {
 const url=new URL(request.url); const metadata=url.pathname==='/.well-known/oauth-authorization-server'; const protocol=['/auth/token','/auth/revoke','/auth/introspect'].includes(url.pathname) || (url.pathname==='/auth'&&request.method==='POST');
 const headers=new Headers({'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
 if(protocol||metadata)headers.set('access-control-allow-origin','*');
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:new Headers([...headers,['content-type','application/json']])});
 try {
 const settings=authSettings(env);const store=dependencies.store??authStore(env);if(!settings||!store)return reply({error:'temporarily_unavailable'},503);
 const origin=new URL(settings.issuer).origin;
 if(url.origin!==origin || (request.headers.has('host')&&request.headers.get('host')!==url.host))authError('invalid_request');
 if(request.method==='OPTIONS'&&(protocol||metadata)){headers.set('access-control-allow-methods',metadata?'GET, OPTIONS':'POST, OPTIONS');headers.set('access-control-allow-headers','Content-Type, Authorization');return new Response(null,{status:204,headers});}
 if(request.method!=='GET'&&request.method!=='POST')return reply({error:'invalid_request'},405);
 const rateKey=Array.from(await digest(`${request.headers.get('cf-connecting-ip')??'unknown'}:${url.pathname}`),b=>b.toString(16).padStart(2,'0')).join('');
 if(!await store.invoke('rateLimit',{key:rateKey}))authError('slow_down');
 const query=parameters(url.searchParams);
 if(url.pathname==='/.well-known/oauth-authorization-server'&&request.method==='GET')return reply({issuer:settings.issuer,authorization_endpoint:origin+'/auth',token_endpoint:origin+'/auth/token',revocation_endpoint:origin+'/auth/revoke',introspection_endpoint:origin+'/auth/introspect',response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],scopes_supported:AUTH_SCOPES,token_endpoint_auth_methods_supported:['none']});
 if(['/auth','/auth/authorize'].includes(url.pathname)&&request.method==='GET') {
 if(query.response_type!=='code'||query.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge??''))authError('invalid_request');
 if(query.me){try{if(new URL(query.me).href!==settings.me)authError('invalid_request');}catch{authError('invalid_request');}}
 const clientId=scalar(query.client_id),redirectUri=scalar(query.redirect_uri),state=scalar(query.state,1024),scope=scopes(query.scope??'');
 const client=await validateClient(clientId,redirectUri,dependencies.publicFetch);const {id}=await store.invoke('createRequest',{clientId,redirectUri,state,scope,codeChallenge:query.code_challenge,...client});headers.set('location',origin+'/account?request='+encodeURIComponent(id));return new Response(null,{status:303,headers});
 }
 if(protocol&&request.method==='POST') {
 const data=await body(request,false);
 if(url.pathname==='/auth/introspect') {const bearer=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];if(!bearer||!env.AUTH_INTROSPECTION_TOKEN||!await equal(bearer,env.AUTH_INTROSPECTION_TOKEN))authError('invalid_token');return reply(await store.invoke('introspectToken',{token:scalar(data.token)}));}
 if(url.pathname==='/auth/revoke'||data.action==='revoke'){await store.invoke('revokeToken',{token:scalar(data.token),clientId:typeof data.client_id==='string'?scalar(data.client_id):undefined});return reply({});}
 if(url.pathname!=='/auth'&&data.grant_type!=='authorization_code')authError('unsupported_grant_type');
 const token=await store.invoke('exchangeCode',{code:scalar(data.code),clientId:scalar(data.client_id),redirectUri:scalar(data.redirect_uri),verifier:scalar(data.code_verifier,128)});
 if(url.pathname==='/auth'){await store.invoke('revokeToken',{token:token.access_token});return reply({me:token.me,scope:token.scope});}return reply(token);
 }
 const session=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';
 if(request.method==='GET') {
 if(url.pathname==='/auth/session'){const info=session?await store.invoke('session',{token:session}):null;return reply({authenticated:!!info,...(info??{}),...await store.invoke('status',{})});}
 if(!session||!await store.invoke('session',{token:session}))authError('invalid_owner_auth');
 if(url.pathname==='/auth/request')return reply(await store.invoke('request',{id:scalar(query.id)}));
 if(url.pathname==='/auth/tokens')return reply(await store.invoke('listTokens',{session}));
 if(url.pathname==='/auth/credentials')return reply(await store.invoke('listCredentials',{session}));
 } else {
 if(request.headers.get('origin')!==origin)authError('access_denied');
 const data=await body(request,true);const authorization={session:session||undefined,csrf:typeof data.csrf==='string'?data.csrf:undefined,setupToken:typeof data.setupToken==='string'?data.setupToken:undefined};
 const setSession=(result:{sessionToken:string;csrf:string;expiresAt:number})=>{headers.set('set-cookie',`${COOKIE}=${result.sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,Math.floor((result.expiresAt-(dependencies.now?.()??Date.now()))/1000))}`);return reply({csrf:result.csrf,expiresAt:result.expiresAt});};
 if(url.pathname==='/auth/passkey/register/options')return reply(await store.invoke('registrationOptions',{authorization,origin}));
 if(url.pathname==='/auth/passkey/register/verify')return setSession(await store.invoke('registrationVerify',{id:scalar(data.id),response:data.response,authorization,origin}));
 if(url.pathname==='/auth/passkey/login/options')return reply(await store.invoke('authenticationOptions',{origin}));
 if(url.pathname==='/auth/passkey/login/verify')return setSession(await store.invoke('authenticationVerify',{id:scalar(data.id),response:data.response,origin}));
 const csrf=scalar(data.csrf);if(!session)authError('invalid_owner_auth');
 if(url.pathname==='/auth/consent'){const result=await store.invoke('approveRequest',{id:scalar(data.id),scope:scopes(data.scope),session,csrf});const target=new URL(result.redirectUri);target.searchParams.set('code',result.code);target.searchParams.set('iss',settings.issuer);if(result.state!==undefined)target.searchParams.set('state',result.state);return reply({redirect:target.href});}
 if(url.pathname==='/auth/logout'){await store.invoke('logout',{session,csrf});headers.set('set-cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return reply({});}
 if(url.pathname==='/auth/tokens')return reply(await store.invoke('personalToken',{session,csrf,scope:scopes(data.scope),name:tokenName(data.name)}));
 if(url.pathname==='/auth/tokens/revoke'){await store.invoke('revokeTokenById',{id:scalar(data.id),session,csrf});return reply({});}
 if(url.pathname==='/auth/credentials/remove'){await store.invoke('removeCredential',{id:scalar(data.id),session,csrf});return reply({});}
 }
 return reply({error:'invalid_request'},404);
 }catch(error){const match=error instanceof Error?/^indieauth:([a-z_]+)$/.exec(error.message):null;const code=match&&Object.hasOwn(AUTH_ERRORS,match[1])?match[1]:'temporarily_unavailable';return reply({error:code},AUTH_ERRORS[code]);}
 };
}
