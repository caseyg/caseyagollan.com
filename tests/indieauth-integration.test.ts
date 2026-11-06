import { expect, test } from 'bun:test';
import { publishingConfig } from '../src/lib/server/publishing/config';
import { authorize } from '../src/lib/server/publishing/auth';
import { forbiddenForm } from '../src/lib/server/form-origin';
const env = { PUBLISHING_ENABLED:'true', PUBLISHING_AUTH_MODE:'internal', AUTH_ENABLED:'true', AUTH_ORIGIN:'https://auth.example.org/', AUTH_ME:'https://example.com/', PUBLISHING_ME:'https://example.com/', PUBLISHING_GITHUB_OWNER:'caseyg',PUBLISHING_GITHUB_REPO:'content',PUBLISHING_GITHUB_BRANCH:'test',PUBLISHING_GITHUB_TOKEN:'git' };
const request = () => new Request('https://example.com/micropub',{headers:{Authorization:'Bearer opaque-token'}});
test('internal publishing validates native owner tokens without an IndieKit or loopback fetch',async()=>{
 let active=true,lookups=0;
 const namespace={idFromName:()=>({}),get:()=>({invoke:async(operation:string,input:any)=>{lookups++;expect(operation).toBe('introspectToken');expect(input.token).toBe('opaque-token');return {active,me:env.AUTH_ME,client_id:'https://client.example.org/',scope:'create update',exp:9999999999};}})} as unknown as DurableObjectNamespace;
 const config=publishingConfig({...env,AUTH_STORE:namespace});expect(config).toBeDefined();
 expect((await authorize(request(),'create',config!,async()=>{throw new Error('must not fetch');})).me).toBe(env.AUTH_ME);
 active=false;await expect(authorize(request(),'create',config!,async()=>{throw new Error('must not fetch');})).rejects.toMatchObject({status:401});expect(lookups).toBe(2);
});
test('missing or broken internal authority fails closed rather than falling back to IndieKit',async()=>{
 expect(publishingConfig(env)).toBeUndefined();
 const namespace={idFromName:()=>({}),get:()=>({invoke:async()=>{throw new Error('unavailable');}})} as unknown as DurableObjectNamespace;
 const config=publishingConfig({...env,AUTH_STORE:namespace});
 await expect(authorize(request(),'create',config!,async()=>{throw new Error('must not fetch');})).rejects.toMatchObject({status:503});
 expect(publishingConfig({...env,AUTH_STORE:namespace,AUTH_ME:'https://someone.example.org/'})).toBeUndefined();
});
test('only code/token protocol endpoints bypass cross-origin form restrictions',()=>{
 const form=(path:string)=>new Request('https://example.com'+path,{method:'POST',headers:{Origin:'https://client.example.org','Content-Type':'application/x-www-form-urlencoded'},body:'code=test'});
 expect(forbiddenForm(form('/auth/token'),'/auth/[...path]')).toBe(false);
 expect(forbiddenForm(form('/auth/revoke'),'/auth/[...path]')).toBe(false);
 expect(forbiddenForm(form('/auth/consent'),'/auth/[...path]')).toBe(true);
 expect(forbiddenForm(form('/auth/passkey/register/verify'),'/auth/[...path]')).toBe(true);
});
