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
</style>
