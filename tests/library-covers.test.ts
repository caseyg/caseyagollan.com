import {expect,test} from 'bun:test';
import {GET,HEAD} from '../src/routes/library/covers/[bookid]/+server';
import metadata from '../static/library/metadata.json';
const [id,entry] = Object.entries(metadata).find(([,entry]) => 'coverUrl' in entry)!;
function event(method='GET', headers:HeadersInit={}) {
	let key='';
	const input={params:{bookid:id},request:new Request(`https://example.com/library/covers/${id}`,{method,headers}),platform:{env:{PUBLISHING_MEDIA:{get:async(value:string)=>{key=value;return {httpEtag:'"cover-etag"',body:new Uint8Array([1,2,3])};}}}}};
	return {input:input as unknown as Parameters<typeof GET>[0],key:()=>key};
}

test('serves only the cached R2 cover under its expected key',async()=>{
	const request=event();const response=await GET(request.input);
	expect(response.status).toBe(200);
	expect(request.key()).toBe(`library/covers/openlibrary-${'coverId' in entry ? entry.coverId : ''}-L.jpg`);
	expect(response.headers.get('content-type')).toBe('image/jpeg');
	expect(response.headers.get('cache-control')).toContain('max-age');
	expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1,2,3]);
});

test('supports HEAD and conditional GET without response bodies',async()=>{
	const head=await HEAD(event('HEAD').input);
	expect(head.status).toBe(200);
	expect(await head.text()).toBe('');
	const conditional=await GET(event('GET',{'If-None-Match':'"cover-etag"'}).input);
	expect(conditional.status).toBe(304);
	expect(await conditional.text()).toBe('');
});

test('rejects unknown IDs before querying R2',async()=>{
	const request=event();request.input.params.bookid='../../private';
	expect((await GET(request.input)).status).toBe(404);
	expect(request.key()).toBe('');
});
