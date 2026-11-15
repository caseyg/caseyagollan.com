<script lang="ts">
 import type { Snippet } from 'svelte';
 import './social-card.css';
 /**
  * The card shell for social posts. Put one SocialPost inside for a single post, or several
  * (with `connected` on all but the last) for a reply and its parent, or a whole thread.
  */
 let { children, label }: { children: Snippet; /** Accessible name, e.g. "Conversation". */ label?: string } = $props();
</script>

<div class="social-card social-card-scope" role={label ? 'group' : undefined} aria-label={label}>{@render children()}</div>

<style>
 .social-card { margin: var(--space-3) 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); }
 @media (max-width: 480px) { .social-card { padding: var(--space-3); } }
 /* On phones the card's edges line up with the pinned nav's, reaching into the page gutter (Page pads var(--space-4) here),
    while its text stays in line with the rest of the page. */
 @media (max-width: 600px) { .social-card { margin-inline: calc(var(--nav-inset) - var(--space-4)); } }
</style>
