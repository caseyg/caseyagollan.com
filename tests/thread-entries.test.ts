import { test, expect } from 'bun:test';
import { rollupIndexPosts, type Post } from '../src/lib/posts-types';
import { buildThreadEntries } from '../src/lib/utils/thread-entries';
import { formatShortRelativeDate } from '../src/lib/utils/formatDate';
import type { SocialSnapshot } from '../src/lib/social-snapshots';

const cordyPost = 'https://bsky.app/profile/did:plc:cordy/post/root';
const annePost = 'https://bsky.app/profile/did:plc:anne/post/anne';
const snapshot = (url: string, name: string, html: string, published: string, parent?: string): SocialSnapshot => ({version:1,url,platform:'bluesky',author:{name,handle:`@${name}.example`,url:`https://bsky.app/profile/${name}`},published,fetchedAt:published,html,images:[],thread:{post:url,root:cordyPost,parent}});
// Casey replies to Cordy, Anne replies to that reply, Casey replies to Anne: the shape of the Oct 3 thread.
const first: Post = {type:'reply',slug:'first',date:'2026-10-03T17:11:48-04:00',content:'cordy hi',filePath:'replies/first.md',inReplyTo:cordyPost,
 syndication:['https://bsky.app/profile/caseyagollan.com/post/first'],socialSnapshots:[snapshot(cordyPost,'cordy','<p>back on the internet</p>','2026-10-03T20:21:27Z')]};
const second: Post = {type:'reply',slug:'second',date:'2026-10-03T18:33:44-04:00',content:'anne hi',filePath:'replies/second.md',inReplyTo:annePost,
 syndication:['https://bsky.app/profile/caseyagollan.com/post/second'],socialSnapshots:[snapshot(annePost,'anne','<p>good to see you both</p>','2026-10-03T21:33:45Z','https://bsky.app/profile/did:plc:casey/post/first')]};

test('a reply thread flattens into one chronological list with each parent shown once',()=>{
 const [group] = rollupIndexPosts([second,first]);
 const entries = buildThreadEntries(group.indexThreadPosts!);
 expect(entries.map(e => e.kind === 'own' ? `own:${e.post.slug}` : e.kind === 'saved' ? e.snapshot.author.name : e.url)).toEqual(['cordy','own:first','anne','own:second']);
});

test('a parent shared by two replies is not repeated, and a reply to one of the site’s own replies does not repeat it',()=>{
 const sibling: Post = {...first,slug:'sibling',filePath:'replies/sibling.md',date:'2026-10-03T17:20:00-04:00',syndication:['https://bsky.app/profile/caseyagollan.com/post/sibling']};
 const ownSnapshot = snapshot('https://bsky.app/profile/did:plc:casey/post/first','Casey','<p>cordy hi</p>','2026-10-03T21:11:48Z');
 const followUp: Post = {...second,slug:'follow',filePath:'replies/follow.md',inReplyTo:ownSnapshot.url,socialSnapshots:[ownSnapshot]};
 const entries = buildThreadEntries([first,sibling,followUp]);
 expect(entries.map(e => e.kind === 'own' ? e.post.slug : e.kind)).toEqual(['saved','first','sibling','follow']);
});

test('likes in a reply thread mark the liked post instead of adding a card',()=>{
 const like: Post = {type:'like',slug:'like',date:'2026-10-03T19:00:00-04:00',content:'',filePath:'likes/like.md',properties:{'like-of':[annePost]},socialSnapshots:[second.socialSnapshots![0]]};
 const entries = buildThreadEntries([first,second,like]);
 expect(entries).toHaveLength(4);
 const anne = entries[2];
 expect(anne.kind === 'saved' && anne.reactions.map(r => r.type)).toEqual(['like']);
});

test('a reply whose parent was not saved says who it replies to',()=>{
 const [entry] = buildThreadEntries([{...first,socialSnapshots:[]}]);
 expect(entry.kind === 'own' && entry.replyTo?.url).toBe(cordyPost);
});

test('thread times use compact relative units',()=>{
 const now = new Date('2026-11-15T00:00:00Z');
 expect(['2026-11-14T23:59:40Z','2026-11-14T23:55:00Z','2026-11-14T21:00:00Z','2026-11-12T00:00:00Z','2026-10-03T00:00:00Z','2024-10-03T00:00:00Z'].map(d => formatShortRelativeDate(d, now))).toEqual(['now','5m','3h','3d','1mo','2y']);
});

test('a rolled-up card answers to an anchor for every post it stands for',()=>{
 const { postAnchors } = require('../src/lib/posts-types');
 const like: Post = {type:'like',slug:'like',date:'2026-10-03T19:00:00-04:00',content:'',filePath:'likes/like.md',
  indexActivities:[{type:'like',date:'2026-10-03T19:00:00-04:00',permalink:'/2026/10/03/like/'},{type:'repost',date:'2026-10-03T19:01:00-04:00',permalink:'/2026/10/03/repost/'}]};
 expect(postAnchors({...second,indexThreadPosts:[first,like,second]})).toEqual(['post-second','post-first','post-like','post-repost']);
});
