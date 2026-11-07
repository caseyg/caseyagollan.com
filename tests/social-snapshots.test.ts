import { expect, test } from 'bun:test';
import { enrichSocialSnapshots as enrich } from '../src/lib/server/publishing/social-snapshots';
import { parsePost } from '../src/lib/server/parse-post';
import { renderPostDetails } from '../src/lib/utils/post-details';
import { readDocument, updateDocument } from '../src/lib/server/publishing/document';

const imageUrl = 'https://files.caseyagollan.com/publishing/social/' + 'a'.repeat(64) + '.png';
const enrichSocialSnapshots = (markdown: string, fetcher?: Parameters<typeof enrich>[1], options: Parameters<typeof enrich>[2] = {}) => enrich(markdown,fetcher ? async(url,init)=>url.includes('getProfile') ? Response.json({did:'did:plc:grant'}) : fetcher(url,init) : undefined,{storeImage:async()=>imageUrl,...options});

const blue = 'https://bsky.app/profile/grantcuster.com/post/3mznoqvc3oc27';
const masto = 'https://social.example/@writer/123';
const source = (key = 'like-of', url = blue) => `---\n${key}:\n  - ${url}\ndate: 2026-11-06T19:08:30-05:00\n---\nMy note`;
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0]);
const blueskyPost = { author: {did:'did:plc:grant',displayName: 'Grant', handle: 'grantcuster.com'}, record: {text: 'Hello <world> 🌍', createdAt: '2026-11-06T12:00:00Z'}, embed: { $type: 'app.bsky.embed.images#view', images: [{fullsize: 'https://cdn.example/image.png',alt: 'An image'}] } };
const fetcher = async (url: string) => {
 if (url.includes('getProfile')) return Response.json({did:'did:plc:grant'});
 if (url.includes('getPostThread')) return Response.json({thread: {post: blueskyPost}});
 if (url.includes('/api/v1/statuses/')) return Response.json({visibility:'public', account:{locked:false,display_name:'Writer',acct:'writer',url:'https://social.example/@writer'},content:'<p>Saved toot <script>bad()</script><a href="javascript:alert(1)">link</a></p>', created_at:'2026-11-06T12:00:00Z', spoiler_text:'CW', media_attachments:[]});
 if(url === 'https://cdn.example/image.png') return new Response(png,{headers:{'content-type':'image/png'}});
 throw new Error('Unexpected URL '+url);
};

test('saves Bluesky text and R2 image references in Markdown and renders likes and reposts statically', async () => {
 for (const [key,folder] of [['like-of','likes'],['repost-of','reposts']]) {
  const saved = await enrichSocialSnapshots(source(key), fetcher);
  expect(saved).toContain('_micropubSocialSnapshots:');
  expect(saved).toContain(imageUrl); expect(saved).not.toContain('base64,');
  const post = parsePost(saved, folder, '2026-11-06-test.md');
  const html = renderPostDetails(post);
  expect(html).toContain('Grant'); expect(html).toContain('Hello &#x3C;world> 🌍'); expect(html).not.toContain('<world>');
  expect(html).toContain('An image'); expect(html).toContain(imageUrl);
  expect(html).toContain(`u-${key}`); expect(html).not.toContain('src="https://cdn.example');
  expect(html).not.toMatch(/<iframe|<script/);
  expect(readDocument(saved).properties).not.toHaveProperty('_micropubSocialSnapshots');
 }
});
test('preserves snapshots without network access on unrelated edits and removes stale targets', async () => {
 const saved = await enrichSocialSnapshots(source(), fetcher);
 const edit = updateDocument(saved, {replace:{content:['Edited']}});
 expect(await enrichSocialSnapshots(edit, async()=>{throw new Error('offline');})).toBe(edit);
 const removed = await enrichSocialSnapshots(updateDocument(edit,{delete:['like-of']}),fetcher);
 expect(removed).not.toContain('_micropubSocialSnapshots');
 const changed = await enrichSocialSnapshots(updateDocument(saved,{replace:{'like-of':['https://example.com/other']}}),fetcher);
 expect(changed).not.toContain('Hello <world>');
});
test('sanitizes Mastodon HTML and preserves content warnings', async () => {
 const saved = await enrichSocialSnapshots(source('repost-of',masto),fetcher);
 const html = renderPostDetails(parsePost(saved,'reposts','2026-11-06-test.md'));
 expect(html).toContain('Saved toot'); expect(html).toContain('CW'); expect(html).toContain('<details>');
 expect(html).not.toContain('<script'); expect(html).not.toContain('javascript:');
});
test('failed, malformed and nonpublic responses retain plain links', async () => {
 for (const response of [new Response(null,{status:404}),Response.json({visibility:'private',content:'secret'}),Response.json({visibility:'unlisted',content:'secret'}),Response.json({})]) {
  const original = source('like-of',masto);
  expect(await enrichSocialSnapshots(original,async()=>response.clone())).toBe(original);
 }
});
test('does not save SVGs, oversized images or remote HTML image trackers', async () => {
 const saved = await enrichSocialSnapshots(source(),async(url)=>url.includes('getPostThread') ? Response.json({thread:{post:blueskyPost}}) : new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}));
 expect(saved).not.toContain('data:image');
 const mastodon = await enrichSocialSnapshots(source('like-of',masto),async()=>Response.json({visibility:'public',account:{locked:false,acct:'a',display_name:'A',url:masto},content:'<p>Text</p><img src="https://tracker.example/pixel">',created_at:'2026-11-06T12:00:00Z',media_attachments:[]}));
 expect(renderPostDetails(parsePost(mastodon,'likes','2026-11-06-test.md'))).not.toContain('tracker.example');
});
test('ignores corrupt stored snapshots rather than rendering unsafe data', () => {
 const markdown = source().replace('date:', '_micropubSocialSnapshots: [{url: "'+blue+'", html: "<script>bad()</script>", images: [{src: "javascript:alert(1)"}]}]\ndate:');
 expect(renderPostDetails(parsePost(markdown,'likes','2026-11-06-test.md'))).not.toContain('<script');
});

test('saved post content does not become our syndication text or extra webmention targets', async () => {
 const { publicationForPost } = await import('../src/lib/server/publishing/publication');
 const saved = await enrichSocialSnapshots(source(),fetcher);
 const publication = await publicationForPost(parsePost(saved,'likes','2026-11-06-test.md'));
 expect(publication.text).not.toContain('Hello');
 expect(publication.text).toContain(`Liked ${blue}`);
 expect(publication.targets).toEqual([blue]);
});

test('preserves Bluesky links and mentions using UTF-8 facet offsets', async () => {
 const text = '🌍 video link @friend';
 const start = new TextEncoder().encode('🌍 video ').length;
 const mentionStart = new TextEncoder().encode('🌍 video link ').length;
 const post = {...blueskyPost,embed:undefined,record:{...blueskyPost.record,text,facets:[{index:{byteStart:start,byteEnd:start+4},features:[{$type:'app.bsky.richtext.facet#link',uri:'https://youtube.com/watch?v=original'}]},{index:{byteStart:mentionStart,byteEnd:new TextEncoder().encode(text).length},features:[{$type:'app.bsky.richtext.facet#mention',did:'did:plc:friend'}]}]}};
 const saved = await enrichSocialSnapshots(source(),async()=>Response.json({thread:{post}}));
 const html = renderPostDetails(parsePost(saved,'likes','2026-11-06-test.md'));
 expect(html).toContain('href="https://youtube.com/watch?v=original"');
 expect(html).toContain('href="https://bsky.app/profile/did:plc:friend"');
 expect(html).toContain('🌍 video ');
});

test('refresh removes a deleted original when another target succeeds', async () => {
 const both = source().replace(`  - ${blue}`,`  - ${blue}\n  - ${masto}`);
 const before = await enrichSocialSnapshots(both,fetcher);
 const refreshed = await enrichSocialSnapshots(before,async url=>url.includes('getPostThread') ? Response.json({thread:{post:{...blueskyPost,record:{...blueskyPost.record,text:'Updated blue'}}}}) : url === 'https://cdn.example/image.png' ? fetcher(url) : new Response(null,{status:404}),{refresh:true});
 const post = parsePost(refreshed,'likes','2026-11-06-test.md');
 expect(post.socialSnapshots).toHaveLength(1);
 expect(post.socialSnapshots!.find(s=>s.url===blue)!.html).toContain('Updated blue');
 expect(post.socialSnapshots!.find(s=>s.url===masto)).toBeUndefined();
});

test('saves the author avatar and renders a Bluesky-style author header and readable timestamp', async () => {
 const saved = await enrichSocialSnapshots(source(),async url=>url.includes('getPostThread') ? Response.json({thread:{post:{...blueskyPost,author:{...blueskyPost.author,avatar:'https://cdn.example/avatar.png'}}}}) : new Response(png,{headers:{'content-type':'image/png'}}));
 const post = parsePost(saved,'likes','2026-11-06-test.md');
 const html = renderPostDetails(post);
 expect(post.socialSnapshots![0].author.avatar).toBe(imageUrl);
 expect(html).toContain('class="social-avatar"');
 expect(html).toContain('class="social-author-name"');
 expect(html).toContain('class="social-author-handle"');
 expect(html).toContain('Nov 6, 2026');
 expect(html).not.toContain('2026-11-06 12:00:00Z');
});

test('omits images if R2 is unavailable; never writes inline image bytes to Git', async () => {
 const saved = await enrich(source(),fetcher,{storeImage:async()=>{throw new Error('R2 offline');}});
 expect(saved).toContain('Hello'); expect(saved).not.toContain('base64,');
 expect(parsePost(saved,'likes','2026-11-06-test.md').socialSnapshots![0].images).toEqual([]);
});

test('R2 storage uses content-addressed immutable keys and returns only public URLs', async () => {
 const {socialImageStore} = await import('../src/lib/server/publishing/social-media');
 const uploads: {key:string;bytes:Uint8Array;options:any}[] = [];
 const store = socialImageStore({put:async(key:string,bytes:Uint8Array,options:any)=>{uploads.push({key,bytes,options});return {key};}} as unknown as R2Bucket,'https://caseyagollan.com/','https://files.caseyagollan.com/');
 const url = await store!(png,'image/png');
 expect(url).toMatch(/^https:\/\/files.caseyagollan.com\/publishing\/social\/[a-f0-9]{64}\.png$/);
 expect(uploads[0].key).toBe(new URL(url).pathname.slice(1));
 expect(uploads[0].bytes).toEqual(png);
 expect(uploads[0].options.httpMetadata.cacheControl).toContain('immutable');
 expect(uploads[0].options.onlyIf).toEqual({etagDoesNotMatch:'*'});
 expect(await store!(png,'image/png')).toBe(url);
 expect(socialImageStore(undefined,'https://caseyagollan.com/')).toBeUndefined();
});

test('refresh preserves the complete saved snapshot if an associated image upload fails', async () => {
 const before = await enrichSocialSnapshots(source(),fetcher);
 const after = await enrichSocialSnapshots(before,async url=>url.includes('getPostThread') ? Response.json({thread:{post:{...blueskyPost,record:{...blueskyPost.record,text:'New text'}}}}) : fetcher(url),{refresh:true,storeImage:async()=>{throw new Error('R2 down');}});
 expect(after).toBe(before);
});

test('saved R2 images are served by the existing media route without publishing credentials', async () => {
 const {serveMedia} = await import('../src/lib/server/publishing/media');
 const key = 'social/'+'a'.repeat(64)+'.png';
 const response = await serveMedia(new Request(`https://caseyagollan.com/media/${key}`,{method:'HEAD'}),key,{head:async(path:string)=>path===`publishing/${key}` ? {size:png.length,httpEtag:'"image"',httpMetadata:{contentType:'image/png'}} : null} as unknown as R2Bucket);
 expect(response.status).toBe(200); expect(response.headers.get('Content-Type')).toBe('image/png');
 expect(response.headers.get('Cache-Control')).toContain('immutable');
});

test('saved photo galleries retain all images, alt text and full-size links through sanitization', async () => {
 const saved = await enrichSocialSnapshots(source(),fetcher);
 const post = parsePost(saved,'likes','2026-11-06-test.md');
 for (const count of [0,1,2,3,4,5]) {
  const snapshot = post.socialSnapshots![0];
  const images = Array.from({length:count},(_,i)=>({src:imageUrl,alt:`Photo ${i+1} <detail>`}));
  const html = renderPostDetails({...post,socialSnapshots:[{...snapshot,images}]});
  expect(html.includes(`social-images-${count}`)).toBe(count > 0);
  expect(html.match(/class="social-attachment"/g)?.length ?? 0).toBe(count);
  expect(html.match(/class="social-image-link"/g)?.length ?? 0).toBe(count);
  if (count) {
   expect(html).toContain(`href="${imageUrl}"`);
   expect(html).toContain('alt="Photo 1 <detail>"');
  }
 }
});

test('saves platform link cards with escaped text and archived preview images', async () => {
 for (const platform of ['mastodon','bluesky']) {
  const card = {url:'https://news.example/story',uri:'https://news.example/story',title:'Story <script>bad</script>',description:'A & B',provider_name:'News',image:'https://cdn.example/card.png',thumb:'https://cdn.example/card.png'};
  const saved = await enrichSocialSnapshots(source('like-of',platform === 'mastodon' ? masto : blue),async url=> {
   if(url.includes('/api/v1/statuses/')) return Response.json({visibility:'public',account:{locked:false,acct:'writer',url:masto},content:'<p>Read this</p>',created_at:'2026-11-06T12:00:00Z',card});
   if(url.includes('getPostThread')) return Response.json({thread:{post:{...blueskyPost,embed:{$type:'app.bsky.embed.recordWithMedia#view',media:{$type:'app.bsky.embed.external#view',external:card}}}}});
   return new Response(png,{headers:{'content-type':'image/png'}});
  });
  const post = parsePost(saved,'likes','2026-11-06-test.md');
  expect(post.socialSnapshots![0].preview?.image).toBe(imageUrl);
  const html = renderPostDetails(post);
  expect(html).toContain('class="social-link-preview"');
  expect(html).toContain('href="https://news.example/story"');
  expect(html).toContain('Story &#x3C;script>bad&#x3C;/script>');
  expect(html).toContain('A &#x26; B');
  expect(html).not.toContain('https://cdn.example/card.png');
 }
});

test('card text survives image failures and unsafe destinations are omitted', async () => {
 for(const uri of ['https://news.example/story','javascript:alert(1)']) {
  const saved = await enrichSocialSnapshots(source(),async url=>url.includes('getPostThread') ? Response.json({thread:{post:{...blueskyPost,embed:{$type:'app.bsky.embed.external#view',external:{uri,title:'Story',description:'Description',thumb:'https://cdn.example/broken.png'}}}}}) : new Response(null,{status:404}));
  const html = renderPostDetails(parsePost(saved,'likes','2026-11-06-test.md'));
  expect(html.includes('class="social-link-preview"')).toBe(uri.startsWith('https:'));
  expect(html).not.toContain('javascript:');
 }
});

test('archives federated website posts via the importing Mastodon instance while preserving canonical targets', async () => {
 const canonical = 'https://rmendes.net/notes/2026/08/16/971cf';
 for (const kind of ['like','repost']) {
  const original = source(`${kind}-of`,canonical).replace('date:', `pesos-source: [mastodon:${kind}:117105821716778870]\ndate:`);
  const status = {id:'117105821716778870',url:canonical,visibility:'public',account:{locked:false,display_name:'Ricardo',acct:'rick@rmendes.net',url:'https://rmendes.net/'},content:'<p>Federated website post</p>',created_at:'2026-08-16T15:08:59.683Z',media_attachments:[]};
  const get = async (url:string) => {
   expect(url).toBe('https://social.coop/api/v1/statuses/117105821716778870');
   return Response.json(kind === 'repost' ? {reblog:status} : status);
  };
  const saved = await enrichSocialSnapshots(original,get,{mastodonInstance:'https://social.coop'});
  const post = parsePost(saved,kind === 'like' ? 'likes' : 'reposts','2026-11-06-971cf.md');
  expect(post.socialSnapshots![0].url).toBe(canonical);
  expect(post.socialSnapshots![0].sourceUrl).toBe('https://social.coop/@rick@rmendes.net/117105821716778870');
  expect(renderPostDetails(post)).toContain('class="social-platform" href="https://social.coop/@rick@rmendes.net/117105821716778870"');
  expect(renderPostDetails(post)).toContain(`class="u-${kind}-of" href="${canonical}"`);
  expect(renderPostDetails(post)).toContain('Federated website post');
  expect(renderPostDetails(post)).toContain('Ricardo');
  for(const changed of [{...status,url:'https://other.example/post'},{...status,visibility:'unlisted'},{...status,visibility:'private'}]) {
   expect(await enrichSocialSnapshots(original,async()=>Response.json(changed),{mastodonInstance:'https://social.coop'})).toBe(original);
  }
 }
});


test('rejects unsafe platform source links and keeps older snapshots renderable', async () => {
 const saved = await enrichSocialSnapshots(source('like-of',masto),fetcher);
 const post = parsePost(saved,'likes','2026-11-06-test.md');
 expect(renderPostDetails(post)).toContain(`class="social-platform" href="${masto}"`);
 const snapshot = post.socialSnapshots![0];
 const { renderSocialSnapshot } = await import('../src/lib/social-snapshots');
 expect(renderSocialSnapshot({...snapshot,sourceUrl:'javascript:alert(1)'})).toBe('');
});

test('quoted Bluesky posts are independently fetched, rendered, stored and indexed',async()=>{
 const quoteUri='at://did:plc:quote/app.bsky.feed.post/quoted1';
 const outer={...blueskyPost,record:{...blueskyPost.record,embed:{$type:'app.bsky.embed.record',record:{uri:quoteUri}}},embed:undefined};
 const quote={...blueskyPost,author:{did:'did:plc:quote',handle:'quote.example',displayName:'Quoted author'},record:{text:'Nested searchable text',createdAt:blueskyPost.record.createdAt},embed:{$type:'app.bsky.embed.external#view',external:{uri:'https://article.example/story',title:'Nested article',description:'Nested description',thumb:'https://cdn.example/image.png'}}};
 const saved=await enrich(source(),async(url)=>url.includes('getProfile')?Response.json({did:new URL(url).searchParams.get('actor')}):url.includes('getPostThread')?Response.json({thread:{post:new URL(url).searchParams.get('uri')===quoteUri?quote:outer}}):new Response(png,{headers:{'content-type':'image/png'}}),{storeImage:async()=>imageUrl});
 const post=parsePost(saved,'likes','2026-11-06-quote.md');
 expect(post.socialSnapshots![0].quote?.author.name).toBe('Quoted author');
 expect(post.socialSnapshots![0].quote?.preview?.image).toBe(imageUrl);
 expect(renderPostDetails(post)).toContain('Nested searchable text');
 expect(renderPostDetails(post)).toContain('social-quoted-post');
 const {postSearchContent}=await import('../utils/search-document');
 const {postAuthors}=await import('../utils/search-filters');
 expect(postSearchContent(post)).toContain('Nested article');
 expect(postAuthors(post)).toContain('@quote.example');
});

test('missing and restricted quoted originals never reuse a saved quote on refresh',async()=>{
 const uri='at://did:plc:quote/app.bsky.feed.post/quoted1';
 const outer={...blueskyPost,record:{...blueskyPost.record,embed:{record:{uri}}}};
 const quote={...blueskyPost,author:{did:'did:plc:quote',handle:'quote.example'},record:{text:'Must disappear',createdAt:blueskyPost.record.createdAt},embed:undefined};
 const run=(blocked:boolean,status=200)=>async(url:string)=>{
  if(url.includes('getProfile'))return Response.json({did:new URL(url).searchParams.get('actor')});
  if(url.includes('getPostThread'))return new URL(url).searchParams.get('uri')===uri ? status!==200?new Response(null,{status}):Response.json({thread:{post:{...quote,...(blocked?{labels:[{val:'!no-unauthenticated'}]}:{})}}}) : Response.json({thread:{post:outer}});
  return new Response(png,{headers:{'content-type':'image/png'}});
 };
 const saved=await enrich(source(),run(false),{storeImage:async()=>imageUrl});expect(saved).toContain('Must disappear');
 for(const [blocked,status] of [[true,200],[false,404]] as const){
  const after=await enrich(saved,run(blocked,status),{refresh:true,storeImage:async()=>imageUrl});
  expect(after).not.toContain('Must disappear');expect(after).toContain('Hello');
 }
});

test('nested saved data has a finite depth and rejects cycles',async()=>{
 const {socialSnapshots}=await import('../src/lib/social-snapshots');
 const saved=await enrichSocialSnapshots(source(),fetcher);const outer=parsePost(saved,'likes','2026-11-06-test.md').socialSnapshots![0];
 const cyclic={...outer};cyclic.quote=cyclic;expect(socialSnapshots([cyclic])).toEqual([]);
 let deep=outer;for(let i=0;i<5;i++)deep={...outer,quote:deep};expect(socialSnapshots([deep])).toEqual([]);
});

test('native Mastodon quotes preserve the original author, text, and public preview',async()=>{
 const outer={id:'123',url:masto,visibility:'public',account:{locked:false,acct:'writer',url:'https://social.example/@writer'},content:'<p>Outer</p>',created_at:'2026-11-06T12:00:00Z',media_attachments:[],quote:{state:'accepted',quoted_status:{id:'456',url:'https://remote.example/@quoted/99'}}};
 const quote={id:'456',url:'https://remote.example/@quoted/99',visibility:'public',account:{locked:false,acct:'quoted@remote.example',url:'https://remote.example/@quoted'},content:'<p>Mastodon quoted text</p>',created_at:'2026-11-05T12:00:00Z',media_attachments:[]};
 const saved=await enrich(source('repost-of',masto),async url=>Response.json(url.endsWith('/456')?quote:outer),{storeImage:async()=>imageUrl});
 expect(parsePost(saved,'reposts','2026-11-06-test.md').socialSnapshots![0].quote?.html).toContain('Mastodon quoted text');
 const privateQuote=await enrich(saved,async url=>Response.json(url.endsWith('/456')?{...quote,account:{...quote.account,locked:true}}:outer),{refresh:true,storeImage:async()=>imageUrl});
 expect(privateQuote).toContain('Outer');expect(privateQuote).not.toContain('Mastodon quoted text');
});

test('authored photos are archived without resizing or changing alt text and dates',async()=>{
 const {archivePhotoProperties}=await import('../src/lib/server/publishing/social-media');
 const bytes=new Uint8Array(2*1024*1024);bytes.set(png);
 const original={published:['2026-01-01T12:00:00Z'],photo:[{url:'https://cdn.example/full.png',alt:'Full resolution',width:2000}]};
 let stored=0;
 const result=await archivePhotoProperties(original,async(data)=>{stored=data.length;return imageUrl;},async()=>new Response(bytes,{headers:{'content-type':'image/png'}}));
 expect(stored).toBe(bytes.length);expect(result.published).toEqual(original.published);
 expect(result.photo).toEqual([{url:imageUrl,alt:'Full resolution',width:2000}]);
 expect(original.photo[0].url).toBe('https://cdn.example/full.png');
 expect((await archivePhotoProperties(original,async()=>{throw new Error('must not store SVG');},async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}))).photo).toEqual(original.photo);
});
