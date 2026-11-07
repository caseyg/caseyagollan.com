import { test, expect } from 'bun:test';
import { mastodonArchiveActivity, mastodonArchiveItems } from '../src/lib/server/publishing/pesos/archives';
import { mastodonActivity, blueskyPublic } from '../src/lib/server/publishing/pesos/providers';
const object = {id:'https://example.org/@a/1',published:'2020-01-01T00:00:00Z',to:['https://www.w3.org/ns/activitystreams#Public'],content:'hello'};
test('archive action dates take precedence, with original dates as fallback',()=>{
 expect(mastodonArchiveActivity({id:'like',type:'Like',object,published:'2021-01-01T00:00:00Z'})?.published).toBe('2021-01-01T00:00:00Z');
 expect(mastodonArchiveActivity({id:'like',type:'Like',object})?.dateSource).toBe('original-post');
 expect(mastodonArchiveActivity({type:'Create',object:{...object,to:[]}})).toBeUndefined();
 expect(mastodonArchiveItems({orderedItems:[1]})).toEqual([1]);
});
test('locked accounts and restricted Bluesky originals are excluded',async()=>{
 expect(mastodonActivity({id:'1',url:object.id,created_at:object.published,visibility:'public',account:{locked:true}},'like','')).toBeUndefined();
 const uri='at://did:plc:a/app.bsky.feed.post/a';
 for (const labels of [[{val:'!no-unauth'}],[{val:'!hide'}],[{val:'!takedown'}]]) {
  expect(await blueskyPublic(async()=>({data:{thread:{post:{uri,record:{text:'text'},author:{labels}}}}}),uri)).toBe(false);
 }
 expect(await blueskyPublic(async()=>({data:{thread:{$type:'blockedPost'}}}),uri)).toBe(false);
 expect(await blueskyPublic(async()=>({data:{thread:{post:{uri,record:{text:'text'},author:{}}}}}),uri)).toBe(true);
});

test('URL-only favourites use original timestamps; boosts use archive action timestamps and source IDs', async()=>{
 const {resolveMastodonArchiveItem} = await import('../src/lib/server/publishing/pesos/archives');
 const status = {id:'1',url:object.id,created_at:object.published,visibility:'public',account:{locked:false},content:'<p>Public</p>',media_attachments:[]};
 const get = async()=>({data:status});
 const like = await resolveMastodonArchiveItem('https://example.org/users/a/statuses/1',get);
 expect(like?.kind).toBe('like');
 expect(like?.id).toBe(`mastodon:archive:like:${object.id}`);
 expect(like?.published).toBe(object.published);
 expect(like?.dateSource).toBe('original-post');
 const item = {type:'Announce',id:'https://home.example/users/me/statuses/2/activity',actor:'https://home.example/users/me',published:'2021-01-01T00:00:00Z',to:object.to,object:object.id};
 const boost = await resolveMastodonArchiveItem(item,get);
 expect(boost?.kind).toBe('repost');
 expect(boost?.published).toBe(item.published);
 expect(boost?.id).toBe('mastodon:repost:2');
 expect(boost?.target).toBe(object.id);
 expect(await resolveMastodonArchiveItem({...item,to:['https://home.example/followers']},get)).toBeUndefined();
 expect(await resolveMastodonArchiveItem({...item,type:'Delete'},get)).toBeUndefined();
});

test('archive imports require live public and unlocked originals; private envelopes cannot override objects',async()=>{
 const {resolveMastodonArchiveItem} = await import('../src/lib/server/publishing/pesos/archives');
 const status = {id:'1',url:object.id,created_at:object.published,visibility:'public',account:{locked:false},content:'public'};
 for (const overrides of [{visibility:'unlisted'},{visibility:'private'},{visibility:'direct'},{account:{locked:true}},{account:{}},{id:'2'}]) {
  expect(await resolveMastodonArchiveItem(object.id,async()=>({data:{...status,...overrides}}))).toBeUndefined();
 }
 expect(mastodonArchiveActivity({type:'Create',to:object.to,object:{...object,to:['https://example.org/followers']}})).toBeUndefined();
 expect(await resolveMastodonArchiveItem({type:'Create',to:object.to,object:{...object,to:['https://example.org/followers']}},async()=>{throw new Error('must not fetch private object');})).toBeUndefined();
});

test('archive-relative media paths are replaced with live absolute media and canonical replies retained',async()=>{
 const {resolveMastodonArchiveItem} = await import('../src/lib/server/publishing/pesos/archives');
 const item = {type:'Create',to:object.to,published:'2020-01-01T00:00:00Z',object:{...object,inReplyTo:'https://other.example/@author/8',attachment:[{mediaType:'image/jpeg',url:'/media/image.jpg'}],tag:[{type:'Hashtag',name:'#art'}]}};
 const activity = await resolveMastodonArchiveItem(item,async()=>({data:{id:'1',url:object.id,created_at:object.published,visibility:'public',account:{locked:false},content:'text',media_attachments:[{type:'image',url:'https://cdn.example/media.jpg',description:'alt text'}]}}));
 expect(activity?.properties.photo).toEqual([{url:'https://cdn.example/media.jpg',alt:'alt text'}]);
 expect(activity?.properties['in-reply-to']).toEqual(['https://other.example/@author/8']);
 expect(activity?.properties.category).toEqual(['art']);
});

test('a public archive copy cannot resurrect a missing or deleted live post',async()=>{
 const {resolveMastodonArchiveItem} = await import('../src/lib/server/publishing/pesos/archives');
 const item = {type:'Create',to:object.to,object};
 for (const status of [404,410]) {
  await expect(resolveMastodonArchiveItem(item,async()=>{throw new Error(`HTTP ${status}`);})).rejects.toThrow(`HTTP ${status}`);
 }
 expect(await resolveMastodonArchiveItem(item,async()=>({data:{}}))).toBeUndefined();
});

test('missing archive timestamps fall back to the live original timestamp',async()=>{
 const {resolveMastodonArchiveItem} = await import('../src/lib/server/publishing/pesos/archives');
 const {published,...withoutDate} = object;
 const activity = await resolveMastodonArchiveItem({type:'Create',to:object.to,object:withoutDate},async()=>({data:{id:'1',url:object.id,created_at:published,visibility:'public',account:{locked:false},content:'text'}}));
 expect(activity?.published).toBe(published);
 expect(activity?.dateSource).toBe('original-post');
});

test('remote favourite IDs cannot collide with another server or the polling instance',async()=>{
 const {resolveMastodonArchiveItem} = await import('../src/lib/server/publishing/pesos/archives');
 const {alreadyRepresented,indexIdentities} = await import('../src/lib/server/publishing/pesos/importer');
 const get = async(url:string)=>({data:{id:'1',url:new URL(url).origin+'/@author/1',created_at:object.published,visibility:'public',account:{locked:false}}});
 const a = (await resolveMastodonArchiveItem('https://one.example/@author/1',get))!;
 const b = (await resolveMastodonArchiveItem('https://two.example/@author/1',get))!;
 expect(a.id).not.toBe(b.id);
 const keys = indexIdentities([{properties:{'pesos-source':[a.id],'like-of':[a.target!]}}]);
 expect(alreadyRepresented(b,keys)).toBe(false);
 expect(alreadyRepresented(a,indexIdentities([{properties:{'pesos-source':['mastodon:like:1'],'like-of':['https://different.example/@author/1']}}]))).toBe(false);
});

test('CAR repository imports preserve CID image references as public image URLs',async()=>{
 const {CarWriter} = await import('@ipld/car');
 const cbor = await import('@ipld/dag-cbor');
 const {CID} = await import('multiformats/cid');
 const {sha256} = await import('multiformats/hashes/sha2');
 const {blueskyArchive} = await import('../src/lib/server/publishing/pesos/archives');
 const block = async(value:unknown)=>{const bytes=cbor.encode(value);return {cid:CID.createV1(cbor.code,await sha256.digest(bytes)),bytes};};
 const image = CID.createV1(0x55,await sha256.digest(new Uint8Array([1,2,3])));
 const post = await block({$type:'app.bsky.feed.post',text:'A photo',createdAt:object.published,embed:{$type:'app.bsky.embed.images',images:[{alt:'Description',image:{$type:'blob',ref:image,mimeType:'image/jpeg',size:3}}]}});
 const mst = await block({l:null,e:[{p:0,k:new TextEncoder().encode('app.bsky.feed.post/abc123'),v:post.cid,t:null}]});
 const commit = await block({did:'did:plc:test',data:mst.cid});
 const {writer,out} = CarWriter.create([commit.cid]);
 const writing = (async()=>{for(const value of [post,mst,commit])await writer.put(value);await writer.close();})();
 const chunks = await Array.fromAsync(out);await writing;
 const activities = await blueskyArchive(Buffer.concat(chunks));
 expect(activities).toHaveLength(1);
 expect(activities[0].properties.photo).toEqual([{url:`https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:test/${image}@jpeg`,alt:'Description'}]);
});
