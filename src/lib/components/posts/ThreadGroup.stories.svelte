<script module lang="ts">
 import { defineMeta } from '@storybook/addon-svelte-csf';
 import ThreadGroup from './ThreadGroup.svelte';
 const { Story } = defineMeta({title:'Posts/ThreadGroup',component:ThreadGroup});
 const base = {type:'like' as const,date:'2026-11-11T18:31:00Z',content:'',slug:'first',filePath:'likes/first.md',properties:{'like-of':['https://bsky.app/profile/example.com/post/first']}};
</script>
<Story name="Liked thread" args={{post:{...base,indexThreadPosts:[base,{...base,slug:'second',filePath:'likes/second.md'}]}}} />
<Story name="Reply and like" args={{post:{...base,indexThreadPosts:[base,{...base,type:'reply',slug:'reply',filePath:'replies/reply.md',content:'My reply',properties:{'in-reply-to':['https://bsky.app/profile/example.com/post/first']}}]}}} />
