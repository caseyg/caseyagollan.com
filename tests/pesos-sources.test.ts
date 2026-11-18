import { test, expect } from 'bun:test';
import { activityDocument, processPesos, type PesosEnvironment } from '../src/lib/server/publishing/pesos/importer';
import { arenaBlock, arenaPage, githubRelease, githubReleasePage, githubStar, githubStarPage } from '../src/lib/server/publishing/pesos/sources';
import { readDocument } from '../src/lib/server/publishing/document';

const release = {type:'ReleaseEvent',public:true,created_at:'2026-11-18T15:00:00Z',repo:{name:'caseyg/pele'},payload:{action:'published',release:{id:77,tag_name:'v1.2.0',name:'v1.2.0',draft:false,html_url:'https://github.com/caseyg/pele/releases/tag/v1.2.0',body:'- Faster layout\n- Fixes',published_at:'2026-11-18T15:00:00Z'}}};
const star = {starred_at:'2026-11-18T16:00:00Z',repo:{id:42,full_name:'someone/tool',html_url:'https://github.com/someone/tool',description:'A useful tool',private:false}};
const link = {id:52443322,type:'Link',created_at:'2026-11-18T17:45:38Z',visibility:'public',state:'available',title:'Times inverted index',description:{markdown:'Paul Ford on *indexes*.'},source:{url:'https://ftrain.com/times-inverted-index',provider:{name:'ftrain.com'}},user:{slug:'casey-gollan'}};

test('releases of the user\'s own public repositories become notes linking to the release',async()=>{
	const note = githubRelease(release,'caseyg')!;
	expect(note).toMatchObject({id:'github:release:77',kind:'post',url:release.payload.release.html_url,slug:'pele-v1-2-0'});
	expect(note.properties.content).toEqual(['Released [pele v1.2.0](https://github.com/caseyg/pele/releases/tag/v1.2.0)\n\n- Faster layout\n- Fixes']);
	expect(githubRelease({...release,repo:{name:'someone/pele'}},'caseyg')).toBeUndefined();
	expect(githubRelease({...release,payload:{...release.payload,release:{...release.payload.release,draft:true}}},'caseyg')).toBeUndefined();
	expect(githubRelease({...release,public:false},'caseyg')).toBeUndefined();
	const file = await activityDocument(note,'America/New_York');
	expect(file.path).toBe('notes/2026-11-18-pele-v1-2-0.md');
	const p = readDocument(file.content).properties;
	expect(p.syndication).toEqual([release.payload.release.html_url]);
	expect(p['pesos-source']).toEqual(['github:release:77']);
	expect(p['mp-syndicate-to']).toBeUndefined();
});

test('stars of public repositories become bookmarks, with no syndication of their own',async()=>{
	const bookmark = githubStar(star)!;
	expect(githubStar({...star,repo:{...star.repo,private:true}})).toBeUndefined();
	expect(githubStar({...star,repo:{...star.repo,private:undefined}})).toBeUndefined();
	const file = await activityDocument(bookmark,'America/New_York');
	expect(file.path).toBe('bookmarks/2026-11-18-someone-tool.md');
	const p = readDocument(file.content).properties;
	expect(p['bookmark-of']).toEqual(['https://github.com/someone/tool']);
	expect(p.name).toEqual(['someone/tool']);
	expect(p.content).toEqual(['A useful tool']);
	expect(p.syndication).toBeUndefined();
});

test('star pages stop paging once they reach stars from before the start date',async()=>{
	const older = {...star,starred_at:'2026-10-01T00:00:00Z',repo:{...star.repo,id:43}};
	let requested: Record<string,string> = {};
	const get = async(_: string,headers: Record<string,string> = {})=>{requested=headers;return {data:[star,older],link:'<https://api.github.com/user/1/starred?page=2>; rel="next"'};};
	const page = await githubStarPage(get,'caseyg',{Authorization:'Bearer x'},'2026-11-17T00:00:00-05:00');
	expect(page.activities.map(a=>a.id)).toEqual(['github:star:42']);
	expect(page.cursor).toBeUndefined();
	expect(requested.Accept).toBe('application/vnd.github.star+json');
	const open = await githubStarPage(async()=>({data:[star],link:'<https://api.github.com/user/1/starred?page=2>; rel="next"'}),'caseyg',{},'2026-11-17T00:00:00-05:00');
	expect(open.cursor).toBe('2');
	const releases = await githubReleasePage(async()=>({data:[release,{...release,payload:{...release.payload,release:{...release.payload.release,id:5,published_at:'2026-01-01T00:00:00Z'}}},{type:'PushEvent'}]}),'caseyg',{},'2026-11-17T00:00:00-05:00');
	expect(releases.activities.map(a=>a.id)).toEqual(['github:release:77']);
	expect(releases.ids).toEqual(['github:release:77','github:release:5']);
});

test('Are.na blocks become bookmarks of what they link to; private blocks and other people\'s blocks never do',async()=>{
	const bookmark = arenaBlock(link as never,'casey-gollan')!;
	expect(bookmark).toMatchObject({id:'arena:block:52443322',kind:'bookmark',url:'https://www.are.na/block/52443322',target:'https://ftrain.com/times-inverted-index'});
	const file = await activityDocument(bookmark,'America/New_York');
	expect(file.path).toBe('bookmarks/2026-11-18-arena-52443322.md');
	const p = readDocument(file.content).properties;
	expect(p['bookmark-of']).toEqual(['https://ftrain.com/times-inverted-index']);
	expect(p.syndication).toEqual(['https://www.are.na/block/52443322']);
	expect(p.name).toEqual(['Times inverted index']);
	expect(p.content).toEqual(['Paul Ford on *indexes*.']);
	for (const visibility of ['private',undefined]) expect(arenaBlock({...link,visibility} as never,'casey-gollan')).toBeUndefined();
	expect(arenaBlock({...link,user:{slug:'someone-else'}} as never,'casey-gollan')).toBeUndefined();
	expect(arenaBlock({...link,type:'Channel'} as never,'casey-gollan')).toBeUndefined();
	const text = arenaBlock({id:9,type:'Text',created_at:'2026-11-18T00:00:00Z',visibility:'closed',content:{markdown:'A thought'},user:{slug:'casey-gollan'}} as never,'casey-gollan')!;
	expect(text.target).toBe('https://www.are.na/block/9');
	expect(text.properties.content).toEqual(['A thought']);
	const image = arenaBlock({id:10,type:'Image',created_at:'2026-11-18T00:00:00Z',visibility:'public',title:'Memo',image:{src:'https://d2w9rnfcy7mm78.cloudfront.net/10/original.jpg',alt_text:'A memo'},user:{slug:'casey-gollan'}} as never,'casey-gollan')!;
	expect(image.properties.photo).toEqual([{url:'https://d2w9rnfcy7mm78.cloudfront.net/10/original.jpg',alt:'A memo'}]);
	// Blocks bookmarked as themselves are not also their own syndicated copy.
	expect(readDocument((await activityDocument(text,'UTC')).content).properties.syndication).toBeUndefined();
});

test('the Are.na feed reads without a token and drops blocks from before the start date',async()=>{
	let headers: Record<string,string> | undefined;
	let url = '';
	const page = await arenaPage(async(u,h)=>{url=u;headers=h;return {data:{data:[link,{...link,id:1,created_at:'2020-01-01T00:00:00Z'},{...link,id:2,visibility:'private'}]}};},'casey-gollan','2026-11-17T00:00:00-05:00');
	expect(headers).toBeUndefined();
	expect(url).toContain('type=Block');
	expect(page.activities.map(a=>a.id)).toEqual(['arena:block:52443322']);
	expect(page.ids).toHaveLength(3);
});

function harness(existing?: string) {
	const files = new Map<string,{value:string;etag:string}>(); let revision = 0;
	const bucket = {
		async get(key:string) {const file=files.get(key);return file ? {etag:file.etag,json:async()=>JSON.parse(file.value)} : null;},
		async put(key:string,value:string,opts?:{onlyIf?:{etagMatches?:string;etagDoesNotMatch?:string}}) {
			const old = files.get(key); const c=opts?.onlyIf;
			if((c?.etagMatches && old?.etag !== c.etagMatches) || (c?.etagDoesNotMatch === '*' && old)) return null;
			const etag = String(++revision); files.set(key,{value,etag});return {etag};
		}
	} as unknown as R2Bucket;
	const env: PesosEnvironment = {PESOS_ENABLED:'true',PUBLISHING_ENABLED:'true',PUBLISHING_ME:'https://caseyagollan.com/',PUBLISHING_INTROSPECTION_ENDPOINT:'https://example.com/introspect',PUBLISHING_GITHUB_OWNER:'caseyg',PUBLISHING_GITHUB_REPO:'caseyagollan-content',PUBLISHING_GITHUB_BRANCH:'main',PUBLISHING_GITHUB_TOKEN:'git-secret',PUBLISHING_STATE:bucket,PESOS_GITHUB_USER:'caseyg',PESOS_ARENA_USER:'casey-gollan',PESOS_SOURCES_SINCE:'2026-11-17T00:00:00-05:00'};
	const writes: any[] = []; const arenaHeaders: Headers[] = [];
	const blobs = new Map<string,string>(existing ? [['initial',existing]] : []);
	const fetcher = (async(input: string | URL | Request,init?:RequestInit)=>{
		const u=String(input);
		if(u.includes('/git/ref/')) return Response.json({object:{sha:'head'}});
		if(u.includes('/git/trees/')) return Response.json({tree:[...blobs].map(([sha],i)=>({type:'blob',path:`bookmarks/2026-11-01-${i}.md`,sha}))});
		if(u.includes('/git/blobs/')) {const content=blobs.get(u.split('/').pop()!)!;return Response.json({encoding:'base64',size:content.length,content:btoa(content)});}
		if(u.includes('/events/public')) return Response.json([release]);
		if(u.includes('/starred')) return Response.json([star]);
		if(u.startsWith('https://api.are.na/')) {arenaHeaders.push(new Headers(init?.headers));return Response.json({data:[link,{...link,id:2,visibility:'private',title:'Secret'}]});}
		if(u === 'https://api.github.com/graphql') {writes.push(JSON.parse(String(init?.body)));return Response.json({data:{createCommitOnBranch:{commit:{oid:'newhead'}}}});}
		throw new Error(`Unexpected URL ${u}`);
	}) as typeof fetch;
	return {env,files,writes,arenaHeaders,fetcher};
}
const committed = (write: any) => write.variables.input.fileChanges.additions.map((a: any)=>({path:a.path,content:new TextDecoder().decode(Uint8Array.from(atob(a.contents),c=>c.charCodeAt(0)))}));

test('a run imports releases, stars and public Are.na blocks in one commit, then never again',async()=>{
	const h = harness();
	const result = await processPesos(h.env,{fetcher:h.fetcher});
	expect(result).toMatchObject({imported:3,failedFeeds:0});
	const files = committed(h.writes[0]);
	expect(files.map((f: any)=>f.path).sort()).toEqual(['bookmarks/2026-11-18-arena-52443322.md','bookmarks/2026-11-18-someone-tool.md','notes/2026-11-18-pele-v1-2-0.md']);
	expect(files.map((f: any)=>f.content).join('\n')).not.toContain('Secret');
	expect(h.arenaHeaders.every(headers=>!headers.has('authorization'))).toBe(true);
	const again = await processPesos(h.env,{fetcher:h.fetcher});
	expect(again.imported).toBe(0);
	expect(h.writes).toHaveLength(1);
});

test('a page bookmarked on the site already is not bookmarked again from Are.na',async()=>{
	const h = harness('---\ndate: 2026-11-01T10:00:00-05:00\nbookmarkOf: https://ftrain.com/times-inverted-index/\n---\n');
	const result = await processPesos(h.env,{fetcher:h.fetcher});
	expect(result.imported).toBe(2);
	expect(committed(h.writes[0]).map((f: any)=>f.path)).not.toContain('bookmarks/2026-11-18-arena-52443322.md');
});
