<script module lang="ts">
 import { defineMeta } from '@storybook/addon-svelte-csf';
 import SavedSocialPost from './SavedSocialPost.svelte';
 import type { SocialSnapshot } from '$lib/social-snapshots';
 const { Story } = defineMeta({ title: 'Posts/SavedSocialPost', component: SavedSocialPost });
 // Saved media must live under files.caseyagollan.com/publishing/social/; these are real saved files.
 const media = 'https://files.caseyagollan.com/publishing/social/';
 const avatar = `${media}9d2d08fc3b03d6aedb727e409e777c895b9a6ecae116f49505c4df11e651e85e.webp`;
 const clip = `${media}3e3e3f4e3f948c9e5e39a9c544c88f5da933a7e1908ea811e3436fb3cc82878a.mp4`;
 const frame = `${media}005d78f3c94eea3bfb954aaee0c766c1ffcc24662bbaa66f3aace46f138cfde3.jpg`;
 const base: SocialSnapshot = {
  version: 1,
  url: 'https://bsky.app/profile/did:plc:l62qwgb24ao745n4lu3wjwes/post/3n2jyfhzpsc2s',
  platform: 'bluesky',
  author: { name: 'grant', handle: '@grantcuster.com', url: 'https://bsky.app/profile/grantcuster.com', avatar },
  published: '2026-11-17T21:29:28.629Z',
  fetchedAt: '2026-11-18T02:12:58.199Z',
  html: '<p>Revamped printing and scanning on the tabletop:</p>',
  images: []
 };
</script>

<Story name="Video" asChild>
 <SavedSocialPost snapshot={{ ...base, video: { src: clip, poster: frame, alt: 'A printer and scanner on a tabletop' } }} />
</Story>

<Story name="Video too large to save" asChild>
 <SavedSocialPost snapshot={{ ...base, video: { poster: frame, alt: 'A printer and scanner on a tabletop' } }} />
</Story>

<Story name="GIF" asChild>
 <SavedSocialPost snapshot={{ ...base, html: '<p>Looping</p>', video: { src: clip, alt: 'A short loop', presentation: 'gif' } }} />
</Story>

<Story name="Mastodon video too large to save" asChild>
 <SavedSocialPost snapshot={{ ...base, platform: 'mastodon', url: 'https://mastodon.social/@friend/1', author: { name: 'Friend', handle: '@friend@mastodon.social', url: 'https://mastodon.social/@friend' }, video: { poster: frame, alt: '' } }} />
</Story>

<Story name="Text only" asChild>
 <SavedSocialPost snapshot={base} />
</Story>
