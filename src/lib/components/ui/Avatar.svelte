<script lang="ts">
	interface Props {
		src?: string;
		/** Used for alt text and the initial shown when there is no image. */
		name?: string;
		size?: 'sm' | 'md';
		class?: string;
	}

	let { src, name = '', size = 'md', class: className = '' }: Props = $props();
</script>

{#if src}
	<img class="avatar avatar--{size} {className}" {src} alt={name} loading="lazy" />
{:else}
	<span class="avatar avatar--{size} placeholder {className}" role="img" aria-label={name || 'Unknown'}>{name.charAt(0) || '?'}</span>
{/if}

<style>
	.avatar {
		display: block;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		object-fit: cover;
	}

	.avatar--md {
		width: 2.75rem;
		height: 2.75rem;
	}

	.avatar--sm {
		width: 2rem;
		height: 2rem;
	}

	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-3);
		font-size: 1.1em;
		font-weight: var(--fw-semibold);
		text-transform: uppercase;
	}
</style>
