/**
 * Format a date as a relative time string (e.g., "2 days ago", "3 months ago")
 */
export function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);
	const diffWeeks = Math.floor(diffDays / 7);
	const diffMonths = Math.floor(diffDays / 30);
	const diffYears = Math.floor(diffDays / 365);

	if (diffSeconds < 60) {
		return 'just now';
	} else if (diffMinutes < 60) {
		return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
	} else if (diffHours < 24) {
		return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
	} else if (diffDays < 7) {
		return diffDays === 1 ? 'yesterday' : `${diffDays} days ago`;
	} else if (diffWeeks < 4) {
		return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
	} else if (diffMonths < 12) {
		return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
	} else {
		return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
	}
}

/**
 * Format a date as a compact relative time, as social apps do in thread views ("now", "5m", "3h", "2d", "1mo", "2y").
 */
export function formatShortRelativeDate(dateStr: string, now: Date = new Date()): string {
	const minutes = Math.floor((now.getTime() - new Date(dateStr).getTime()) / 60000);
	if (minutes < 1) return 'now';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d`;
	if (days < 365) return `${Math.floor(days / 30)}mo`;
	return `${Math.floor(days / 365)}y`;
}

/**
 * Format a date as an absolute string for tooltip/title
 */
export function formatAbsoluteDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * Format a date for display in post metadata (shorter format)
 */
export function formatPostDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}
