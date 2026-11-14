<script module lang="ts">
 import { defineMeta } from '@storybook/addon-svelte-csf';
 import ThreadGroup from './ThreadGroup.svelte';
 const { Story } = defineMeta({title:'Posts/ThreadGroup',component:ThreadGroup});
 const first = 'https://bsky.app/profile/example.com/post/first', second = 'https://bsky.app/profile/example.com/post/second';
 const saved = (url: string, html: string) => ({version: 1 as const, url, platform: 'bluesky' as const, author: {name: 'Example Reader', handle: '@example.com', url: 'https://bsky.app/profile/example.com'}, published: '2026-11-11T13:00:00-05:00', fetchedAt: '2026-11-11T18:31:00Z', html, images: []});
 const base = {type:'like' as const,date:'2026-11-11T18:31:00Z',content:'',slug:'first',filePath:'likes/first.md',properties:{'like-of':[first]},socialSnapshots:[saved(first,'<p>Research is a way of paying attention together.</p>')]};
 const next = {...base,slug:'second',filePath:'likes/second.md',properties:{'like-of':[second]},socialSnapshots:[saved(second,'<p>And attention is how a practice stays alive.</p>')]};
</script>
<Story name="Liked thread" args={{post:{...base,indexThreadPosts:[base,next]}}} />
<Story name="Reply and like" args={{post:{...base,indexThreadPosts:[base,{...base,type:'reply',slug:'reply',filePath:'replies/reply.md',content:'My reply',properties:{'in-reply-to':['https://bsky.app/profile/example.com/post/first']}}]}}} />
