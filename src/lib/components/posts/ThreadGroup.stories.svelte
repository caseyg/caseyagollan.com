<script module lang="ts">
 import { defineMeta } from '@storybook/addon-svelte-csf';
 import ThreadGroup from './ThreadGroup.svelte';
 const { Story } = defineMeta({title:'Posts/ThreadGroup',component:ThreadGroup});
 const first = 'https://bsky.app/profile/example.com/post/first', second = 'https://bsky.app/profile/example.com/post/second';
 const saved = (url: string, html: string) => ({version: 1 as const, url, platform: 'bluesky' as const, author: {name: 'Example Reader', handle: '@example.com', url: 'https://bsky.app/profile/example.com'}, published: '2026-11-11T13:00:00-05:00', fetchedAt: '2026-11-11T18:31:00Z', html, images: []});
 const base = {type:'like' as const,date:'2026-11-11T18:31:00Z',content:'',slug:'first',filePath:'likes/first.md',properties:{'like-of':[first]},socialSnapshots:[saved(first,'<p>Research is a way of paying attention together.</p>')]};
 const next = {...base,slug:'second',filePath:'likes/second.md',properties:{'like-of':[second]},socialSnapshots:[saved(second,'<p>And attention is how a practice stays alive.</p>')]};

 // A conversation like Oct 3, 2026: a friend posts, Casey replies, a second friend replies to Casey, Casey replies again.
 const cordy = 'https://bsky.app/profile/did:plc:cordy/post/root', anne = 'https://bsky.app/profile/did:plc:anne/post/anne';
 const person = (url: string, name: string, handle: string, html: string, published: string, images: {src: string; alt: string}[] = []) => ({version: 1 as const, url, platform: 'bluesky' as const, author: {name, handle, url: `https://bsky.app/profile/${handle.slice(1)}`}, published, fetchedAt: published, html, images, thread: {post: url, root: cordy}});
 const reply = (slug: string, date: string, content: string, inReplyTo: string, snapshot?: ReturnType<typeof person>) => ({type:'reply' as const, slug, date, content, contentFormat:'text' as const, filePath:`replies/${slug}.md`, inReplyTo, syndication:[`https://bsky.app/profile/caseyagollan.com/post/${slug}`], socialSnapshots: snapshot ? [snapshot] : []});
 const hi = reply('cordy-hi','2026-10-03T17:11:48-04:00','cordy hiiiiii! 🫶',cordy,person(cordy,'mx cordelia yu','@thebestsophist.bsky.social','<p>Okay. I might be back on the internet.</p>','2026-10-03T20:21:27Z'));
 const anneHi = reply('anne-hi','2026-10-03T18:33:44-04:00','anne hiiii! 🫶',anne,person(anne,'Anne Libby','@annelibby.bsky.social','<p>lol good to see you both</p>','2026-10-03T21:33:45Z'));
 const liked = {type:'like' as const, slug:'liked', date:'2026-10-03T19:00:00-04:00', content:'', filePath:'likes/liked.md', properties:{'like-of':[anne]}, socialSnapshots:[anneHi.socialSnapshots[0]]};
 const unsaved = reply('unsaved','2026-10-03T17:11:48-04:00','Replying where the parent post was not saved.',cordy);
 const long = reply('long','2026-10-03T19:10:00-04:00','A longer reply that wraps across several lines, to check that the text column stays aligned with the name above it and the thread line keeps running down to the next avatar without a gap. '.repeat(2),anne);
</script>
<Story name="Liked thread" args={{post:{...base,indexThreadPosts:[base,next]}}} />
<Story name="Reply and like" args={{post:{...base,indexThreadPosts:[base,{...base,type:'reply',slug:'reply',filePath:'replies/reply.md',content:'My reply',properties:{'in-reply-to':['https://bsky.app/profile/example.com/post/first']}}]}}} />
<Story name="Reply thread" args={{post:{...anneHi,indexThreadPosts:[hi,anneHi]}}} />
<Story name="Liked and reposted" args={{post:{...base,indexThreadPosts:[base,{...next,type:'repost',properties:{'repost-of':[second]}}]}}} />
<Story name="Reply thread with a like" args={{post:{...anneHi,indexThreadPosts:[hi,liked,anneHi]}}} />
<Story name="Long reply" args={{post:{...long,indexThreadPosts:[hi,anneHi,long]}}} />
<Story name="Parent not saved" args={{post:{...unsaved,indexThreadPosts:[unsaved]}}} />
