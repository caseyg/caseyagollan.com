import {test,expect} from 'bun:test';
import {duplicateOriginal} from '../src/lib/server/publishing/pesos/duplicates';
import type {Activity} from '../src/lib/server/publishing/pesos/providers';
import {publicationForPost} from '../src/lib/server/publishing/publication';
import {parsePost} from '../src/lib/server/parse-post';

const text = 'to play in a place where there is resonance';
const activity: Activity = {id:'mastodon:post:123',kind:'post',service:'mastodon',url:'https://social.coop/@caseyg/123',published:'2025-08-05T00:01:00Z',properties:{content:[{html:`<p>${text}</p>`}]}};
const original = {properties:{content:[text],published:['2025-08-04T23:59:00Z'],'pesos-source':['at://did:plc:casey/app.bsky.feed.post/abc'],syndication:['https://bsky.app/profile/did:plc:casey/post/abc']}};

test('authored text copies match across formats, source networks, and midnight',()=>{
 expect(duplicateOriginal(activity,[original])).toBe(original);
 expect(duplicateOriginal({...activity,properties:{content:[{html:`<p> ${text.replaceAll(' ','  ')} </p>`}]}},[original])).toBe(original);
});
test('duplicate detection refuses reactions, short text, media, replies, same-network repeats, stale or ambiguous originals',()=>{
 expect(duplicateOriginal({...activity,kind:'like'},[original])).toBeUndefined();
 expect(duplicateOriginal({...activity,properties:{content:['hello']}},[original])).toBeUndefined();
 expect(duplicateOriginal(activity,[original,{...original}])).toBeUndefined();
 expect(duplicateOriginal({...activity,published:'2025-08-07T00:00:00Z'},[original])).toBeUndefined();
 expect(duplicateOriginal(activity,[{properties:{...original.properties,'pesos-source':['mastodon:post:456']}}])).toBeUndefined();
 expect(duplicateOriginal(activity,[{properties:{...original.properties,deleted:['true']}}])).toBeUndefined();
 for (const key of ['photo','video','audio','in-reply-to','like-of','repost-of']) {
  expect(duplicateOriginal(activity,[{properties:{...original.properties,[key]:['https://example.com/item']}}])).toBeUndefined();
 }
 expect(duplicateOriginal({...activity,properties:{...activity.properties,photo:[{url:'https://example.com/image'}]}},[original])).toBeUndefined();
});
test('actual link destinations and content warnings must agree',()=>{
 const content = `${text} https://example.com/article`;
 const entry = {properties:{...original.properties,content:[content]}};
 expect(duplicateOriginal({...activity,properties:{content:[{html:`<p>${text} <a href="https://example.com/article">https://example.com/art…</a></p>`}]}},[entry])).toBe(entry);
 expect(duplicateOriginal({...activity,properties:{content:[{html:`<p>${text} <a href="https://different.example/article">https://example.com/art…</a></p>`}]}},[entry])).toBeUndefined();
 expect(duplicateOriginal({...activity,properties:{...activity.properties,summary:['CW']}},[original])).toBeUndefined();
});
test('imported records never automatically POSSE even with stale destination metadata',async()=>{
 const raw='---\ndate: 2026-07-13T12:00:00-04:00\npesos-source: [mastodon:post:123]\n---\nImported post';
 const post={...parsePost(raw,'notes','2026-07-13-test.md'),syndicationTargets:['mastodon','bluesky']};
 expect((await publicationForPost(post)).syndicateTo).toEqual([]);
 const native={...post,properties:{}};
 expect((await publicationForPost(native)).syndicateTo).toEqual(['mastodon','bluesky']);
});
