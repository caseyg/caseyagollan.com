/**
 * A picture of a saved table for a model to look at when no canvas is open to draw the real one:
 * the plan (`$lib/table-plan`) rendered to a JPEG by Browser Rendering, the same service that
 * takes the site's page screenshots. Null where that isn't set up or doesn't answer; the caller
 * still has the key and the layout issues to go on.
 */
import type { TablePicture } from '../table-plan';

export interface PictureEnvironment { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string }

export async function tablePictureJpeg(env: PictureEnvironment, picture: TablePicture, fetcher?: typeof fetch): Promise<{ mimeType: string; data: string } | null> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID, apiToken = env.CLOUDFLARE_API_TOKEN;
	if (!accountId || !apiToken) return null;
	try {
		const response = await (fetcher ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				html: `<!doctype html><body style="margin:0;background:#2b2b2f">${picture.svg}</body>`,
				viewport: { width: picture.width, height: picture.height },
				screenshotOptions: { type: 'jpeg', quality: 72 }
			})
		});
		if (!response.ok) {
			console.warn(JSON.stringify({ event: 'table_picture_failed', status: response.status, detail: (await response.text()).slice(0, 200) }));
			return null;
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		let binary = '';
		for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
		return { mimeType: 'image/jpeg', data: btoa(binary) };
	} catch (error) {
		console.warn(JSON.stringify({ event: 'table_picture_failed', detail: String(error).slice(0, 200) }));
		return null;
	}
}
