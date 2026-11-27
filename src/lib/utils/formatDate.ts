// "yesterday" and "last week" where the language has a word for it, otherwise "3 days ago".
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 365 * 86400], ['month', 30 * 86400], ['week', 7 * 86400], ['day', 86400], ['hour', 3600], ['minute', 60]];

/**
 * Format a date as a relative time string (e.g., "2 days ago", "last month")
 */
export function formatRelativeDate(dateStr: string, now: Date = new Date()): string {
	const seconds = Math.floor((now.getTime() - new Date(dateStr).getTime()) / 1000);
	const [unit, size] = UNITS.find(([, size]) => seconds >= size) ?? [];
	return unit && size ? relative.format(-Math.floor(seconds / size), unit) : 'just now';
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
// Reused formatters: toLocaleString builds a new one on every call, which dominates feed renders.
const absoluteDate = new Intl.DateTimeFormat('en-US', {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});
const postDate = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});

export function formatAbsoluteDate(dateStr: string): string {
	return absoluteDate.format(new Date(dateStr));
}

/**
 * Format a date for display in post metadata (shorter format)
 */
export function formatPostDate(dateStr: string): string {
	return postDate.format(new Date(dateStr));
}
