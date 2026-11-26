<script lang="ts">
 import type { Snippet } from 'svelte';
 import './social-card.css';
 /**
  * The card shell for social posts. Put one SocialPost inside for a single post, or several
  * (with `connected` on all but the last) for a reply and its parent, or a whole thread.
  */
 let { children, label, fill = false }: { children: Snippet; /** Accessible name, e.g. "Conversation". */ label?: string; /** Fills the box it is given, as a block on a table: no outer margin, the page's ground behind it, and what doesn't fit fades out above its bottom edge. */ fill?: boolean } = $props();
</script>

<div class="social-card social-card-scope" class:fill role={label ? 'group' : undefined} aria-label={label}>{@render children()}</div>

<style>
 .social-card { margin: var(--space-3) 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); }
 @media (max-width: 480px) { .social-card { padding: var(--space-3); } }
 /* On phones the card's edges line up with the pinned nav's, reaching into the page gutter (Page pads var(--space-4) here),
    while its text stays in line with the rest of the page. */
 @media (max-width: 600px) { .social-card:not(.fill) { margin-inline: calc(var(--nav-inset) - var(--space-4)); } }
 .fill { box-sizing: border-box; width: 100%; height: 100%; margin: 0; overflow: hidden; background: var(--bg-primary); mask-image: linear-gradient(to bottom, black calc(100% - var(--space-6)), transparent calc(100% - 2px), black calc(100% - 2px)); }
</style>
