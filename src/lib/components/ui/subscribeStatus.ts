import type { SubscribeOutcome } from './SubscribeForm.svelte';

export type SubscribeStatus = SubscribeOutcome['status'] | 'confirmed';

const STATUSES: readonly SubscribeStatus[] = ['subscribed', 'confirmed', 'already', 'invalid', 'unavailable', 'failed'];

/**
 * A signup sent without JavaScript comes back to its page as `?subscribe=<status>`. Reads that
 * answer once and takes it out of the address, so a reload or a shared link doesn't repeat it.
 */
export function takeSubscribeStatus(): SubscribeStatus | undefined {
	const url = new URL(location.href);
	const status = url.searchParams.get('subscribe') as SubscribeStatus | null;
	if (!status || !STATUSES.includes(status)) return undefined;
	url.searchParams.delete('subscribe');
	history.replaceState(history.state, '', url);
	return status;
}
