<script lang="ts">
 import SocialPost from './SocialPost.svelte';
 import PostContent from './PostContent.svelte';
 import PostMedia from './PostMedia.svelte';
 import { getPostPermalink, type Post } from '$lib/posts-types';
 import { siteAuthor, socialSource } from '$lib/social-card';
 import { renderLinkPreviews, renderPostQuotations } from '$lib/utils/post-details';
 import { localizeLinks } from '$lib/wiki/links';
 import './social-card.css';
 /** One of the site's own notes or replies, drawn as a SocialPost with its syndicated copies as source links. */
 let { post, connected = false, hEntry = false, editHref, replyTo }: { post: Post; connected?: boolean; hEntry?: boolean; editHref?: string; /** Who this replies to, when that post is not shown above it. */ replyTo?: { url: string; label: string } } = $props();
 // On this site the handle is the domain.
 const author = { ...siteAuthor, handle: '@caseyagollan.com' };
 const sources = $derived((post.syndication ?? []).map(link => socialSource(link, 'u-syndication')));
 const cards = $derived(renderLinkPreviews(post));
 const quotes = $derived(renderPostQuotations(post));
</script>

<SocialPost {author} date={post.date} url={getPostPermalink(post)} {sources} {editHref} {connected} {hEntry} context={replyTo ? replyContext : undefined}>
 {#if hEntry && post.inReplyTo && !replyTo}<a class="u-in-reply-to" href={post.inReplyTo} hidden>In reply to</a>{/if}
 <div class="social-card-scope">
  {#if post.summary}<p class="p-summary">{post.summary}</p>{/if}
  <PostMedia photos={post.photo} videos={post.video} />
  <PostContent content={post.content} format={post.contentFormat} />
  {#if cards}{@html localizeLinks(cards)}{/if}
  {#if quotes}<div class="social-quoted-post">{@html localizeLinks(quotes)}</div>{/if}
 </div>
</SocialPost>

{#snippet replyContext()}Replying to <a class:u-in-reply-to={hEntry} href={replyTo?.url}>{replyTo?.label}</a>{/snippet}
