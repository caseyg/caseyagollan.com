<script lang="ts">
 import type { Snippet } from 'svelte';
 import { renderSocialCardHeader, renderSocialCardFooter, siteAuthor, type SocialCardAuthor } from '$lib/social-card';
 import './social-card.css';
 // Saved snapshots already contain sanitized card markup; native posts supply a snippet.
 let { author = siteAuthor, published = '', url = '', children, html }: {
  author?: SocialCardAuthor; published?: string; url?: string; children?: Snippet; html?: string;
 } = $props();
</script>

<div class="social-card-scope">
 {#if html !== undefined}
  {@html html}
 {:else if children}
 <div class="social-snapshot">
  {@html renderSocialCardHeader(author)}
  {@render children()}
  {@html renderSocialCardFooter(published, url)}
 </div>
 {/if}
</div>
