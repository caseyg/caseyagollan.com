import { mount, unmount } from 'svelte';
import SubscribePanel from './SubscribePanel.svelte';
import { takeSubscribeStatus, type SubscribeStatus } from './subscribeStatus';

const EMBEDS = '.embed-subscribe';

/**
 * Turns the subscribe line in rendered Markdown (a bare caseyagollan.com/subscribe link, see
 * `renderContent`) into the signup form and feed links, as Prose does for every post. The written
 * line stays for feeds, email and readers without JavaScript; the panel goes in beside it.
 */
export function subscribeEmbeds(node: HTMLElement) {
	const drawn = new Map<HTMLElement, ReturnType<typeof mount>>();
	let initial: SubscribeStatus | undefined;
	let read = false;

	function scan() {
		for (const [embed, panel] of drawn) {
			if (embed.isConnected && node.contains(embed)) continue;
			unmount(panel);
			drawn.delete(embed);
		}
		for (const embed of node.querySelectorAll<HTMLElement>(EMBEDS)) {
			if (drawn.has(embed)) continue;
			if (!read) {
				initial = takeSubscribeStatus();
				read = true;
			}
			embed.classList.add('embed-subscribe--live');
			const target = document.createElement('div');
			target.className = 'embed-subscribe-panel';
			embed.appendChild(target);
			drawn.set(embed, mount(SubscribePanel, { target, props: { initial } }));
		}
	}

	scan();
	const observer = new MutationObserver((records) => {
		if (records.some((record) => !(record.target as Element).closest?.('.embed-subscribe-panel'))) scan();
	});
	observer.observe(node, { childList: true, subtree: true });
	return () => {
		observer.disconnect();
		for (const panel of drawn.values()) unmount(panel);
		drawn.clear();
	};
}
