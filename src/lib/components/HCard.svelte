<script lang="ts">
	import { SITE_IDENTITY, type SiteIdentity } from '$lib/identity';

	interface Props {
		/**
		 * `profile` is the homepage's representative h-card: visible, with the `rel=me`
		 * profile links. `author` is the hidden `p-author` h-card inside each post's h-entry.
		 */
		variant?: 'profile' | 'author';
		identity?: SiteIdentity;
	}

	let { variant = 'profile', identity = SITE_IDENTITY }: Props = $props();
</script>

{#if variant === 'author'}
	<!-- Read by Bridgy, Webmention receivers and readers; hidden because the page already says who wrote it. -->
	<span class="p-author h-card" hidden><a class="u-url p-name" href={identity.url}>{identity.name}</a>{#if identity.photo}<img class="u-photo" src={identity.photo} alt="" loading="lazy" />{/if}</span>
{:else}
	<div class="h-card profile">
		<a class="u-url u-uid photo-link" href={identity.url} tabindex="-1" aria-hidden="true">{#if identity.photo}<img class="u-photo photo" src={identity.photo} alt="" width="48" height="48" loading="lazy" />{:else}<span class="photo"></span>{/if}</a>
		<div class="details">
			<p class="name"><a class="p-name" href={identity.url}>{identity.name}</a> <span class="p-locality locality">{identity.locality}</span></p>
			<p class="p-note note">{identity.note}</p>
			<ul class="profiles" aria-label="Elsewhere">
				{#each identity.profiles as profile (profile.href)}
					<li><a class="u-url" href={profile.href} rel="me">{profile.label}</a></li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	.profile {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		color: var(--text-secondary);
	}

	.photo-link {
		flex-shrink: 0;
	}

	.photo {
		display: block;
		width: 3rem;
		height: 3rem;
		border-radius: var(--radius-full);
		object-fit: cover;
		background: var(--surface-3);
	}

	.details {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.details p {
		margin: 0;
	}

	.name a {
		color: var(--text-primary);
		font-weight: var(--fw-semibold);
		text-decoration: none;
	}

	.locality {
		color: var(--text-muted);
	}

	.locality::before {
		content: '· ';
	}

	.profiles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: var(--space-1) 0 0;
		padding: 0;
		list-style: none;
	}

	.profiles a,
	.name a {
		text-underline-offset: var(--underline-offset);
	}

	.profiles a {
		color: inherit;
	}

	.name a:hover,
	.profiles a:hover {
		text-decoration: underline;
	}
</style>
