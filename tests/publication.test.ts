import { expect, test } from 'bun:test';
import { publicationRevision, publicationForPost, createPublicationManifest } from '../src/lib/server/publishing/publication';
import { parsePost } from '../src/lib/server/parse-post';
import type { Post } from '../src/lib/posts-types';
const p = (extra:Partial<Post>={}):Post => ({slug:'hello',type:'note',date:'2026-11-05T23:30:00-05:00',content:'Hello',filePath:'notes/hello.md',...extra});
test('revision is deterministic and excludes delivery bookkeeping but includes visible edits',async()=>{
 const revision=await publicationRevision(p());
 expect(revision).toMatch(/^[a-f0-9]{64}$/);
 expect(await publicationRevision(p({updated:'2026-11-07',syndication:['https://social.example/a'],syndicationTargets:['mastodon'],filePath:'other'}))).toBe(revision);
 for(const change of [{content:'Edited'},{title:'Title'},{photo:[{url:'https://media.example/a.jpg'}]},{draft:true},{visibility:'private'},{category:['tag']},{inReplyTo:'https://example.com'}]) expect(await publicationRevision(p(change))).not.toBe(revision);
});
test('extracts plain text and unique external HTTPS links from sanitized HTML and relationships',async()=>{
 const item=await publicationForPost(p({contentFormat:'html',content:'<p>Hello &amp; world</p><script>bad()</script><a href="https://example.com/a#one">A</a><a href="https://example.com/a#two">B</a><a href="http://example.com">HTTP</a><a href="/own">Own</a>',inReplyTo:'https://reply.example/x',bookmarkOf:'https://caseyagollan.com/own',syndicationTargets:['mastodon','bluesky']}));
 expect(item.text).toContain('Hello & world'); expect(item.text).not.toContain('bad()'); expect(item.text).not.toContain('<p>');
 expect(item.targets).toEqual(['https://example.com/a','https://reply.example/x']);
 expect(item.sourcePath).toBe('notes/hello.md'); expect(item.url).toBe('https://caseyagollan.com/2026/11/05/hello/'); expect(item.syndicateTo).toEqual(['mastodon','bluesky']);
});
test('filters nonpublic, drafts and invalid dates, and bounds targets',async()=>{
 const posts=[p(),p({draft:true}),p({deleted:true}),p({visibility:'private'}),p({postStatus:'draft'}),p({date:'bad'})];
 expect((await createPublicationManifest(posts)).publications).toHaveLength(1);
 const many=await publicationForPost(p({contentFormat:'html',content:Array.from({length:40},(_,i)=>`<a href="https://example.com/${i}">${i}</a>`).join('')}));
 expect(many.targets).toHaveLength(32);
});
test('normalizes updated and syndication target metadata',()=>{
 const post=parsePost('---\ndate: 2026-11-05\nupdated: [2026-11-06]\nsyndicationTargets: [mastodon, 2, bluesky, mastodon]\n---\nHello','notes','2026-11-05-hello.md');
 expect(post.updated).toBe('2026-11-06');expect(post.syndicationTargets).toEqual(['mastodon','bluesky']);
});

test('retains existing revision hashes for posts without new structured data', async () => {
 // Recorded from the original revision schema for p(); avoids resending unchanged history.
 expect(await publicationRevision(p())).toBe('f3a2bc6da48f350ec2d6903f6f8c60d7f287404f6ae5c5e464ff933dad3c197e');
});
