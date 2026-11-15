<script lang="ts">
	import { Avatar, AvatarFallback, AvatarImage } from '@ui-sdk/svelte/avatar';

	interface Props {
		src?: string;
		/** Used for alt text and the initial shown while the image loads, or when there is none. */
		name?: string;
		size?: 'sm' | 'md';
		class?: string;
	}

	let { src, name = '', size = 'md', class: className = '' }: Props = $props();
</script>

<Avatar class="avatar avatar--{size} {className}">
	{#if src}<AvatarImage class="avatar-image" {src} alt={name} loading="lazy" />{/if}
	<AvatarFallback class="avatar-fallback" role="img" aria-label={src ? undefined : name || 'Unknown'}>{name.charAt(0) || '?'}</AvatarFallback>
</Avatar>

<style>
	:global(.avatar) {
		position: relative;
		display: block;
		flex-shrink: 0;
		overflow: hidden;
		border-radius: var(--radius-full);
		background: var(--surface-3);
	}

	:global(.avatar--md) {
		width: 2.75rem;
		height: 2.75rem;
	}

	:global(.avatar--sm) {
		width: 2rem;
		height: 2rem;
	}

	:global(.avatar-image) {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	:global(.avatar-fallback) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		font-size: 1.1em;
		font-weight: var(--fw-semibold);
		text-transform: uppercase;
	}
</style>
