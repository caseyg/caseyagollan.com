/** What each IndieAuth permission lets an app do, in the owner's words. */
export const SCOPES: Record<string, string> = {
	profile: 'Read your public profile.',
	read: 'Read content available to this account.',
	create: 'Create posts.',
	update: 'Edit existing posts.',
	delete: 'Delete posts.',
	draft: 'Work with drafts.',
	media: 'Upload images and other media.'
};

export const accountDate = (value: number) => new Date(value < 1e12 ? value * 1000 : value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The host of an app's address, or the address itself when it isn't a URL. */
export function hostOf(address: string): string {
	try { return new URL(address).host; } catch { return address; }
}
