<script module lang="ts">
 import { defineMeta } from '@storybook/addon-svelte-csf';
 import ThreadEntry from './ThreadEntry.svelte';
 import { siteAuthor } from '$lib/social-card';
 const { Story } = defineMeta({title:'Posts/ThreadEntry',component:ThreadEntry});
 const casey = {...siteAuthor, handle: '@caseyagollan.com'};
 const reader = {name: 'Example Reader', handle: '@example.bsky.social', url: 'https://bsky.app/profile/example.bsky.social'};
 const bluesky = [{url: 'https://bsky.app/profile/caseyagollan.com/post/1', label: '🦋', title: 'View on Bluesky'}];
</script>

<Story name="Connected pair">
 <ThreadEntry author={reader} date="2026-10-03T20:21:27Z" url="https://bsky.app/" connected sources={bluesky}><p>Okay. I might be back on the internet.</p></ThreadEntry>
 <ThreadEntry own author={casey} date="2026-10-03T21:11:48Z" url="/2026/10/03/reply/" sources={bluesky} editHref="/2026/10/03/reply/edit/"><p>cordy hiiiiii! 🫶</p></ThreadEntry>
</Story>

<Story name="Replying to an unsaved post">
 <ThreadEntry own author={casey} date="2026-10-03T21:11:48Z" url="/2026/10/03/reply/" sources={bluesky}>
  {#snippet context()}Replying to <a href="https://bsky.app/">@example.bsky.social</a>{/snippet}
  <p>A reply whose parent post was not saved.</p>
 </ThreadEntry>
</Story>

<Story name="Long name and handle">
 <ThreadEntry author={{...reader, name: 'Someone With A Very Long Display Name Indeed', handle: '@a-very-long-handle-that-wraps.bsky.social'}} date="2026-10-03T20:21:27Z" sources={bluesky}><p>Meta lines wrap on narrow screens.</p></ThreadEntry>
</Story>
