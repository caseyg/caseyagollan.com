import { fromHtml } from 'hast-util-from-html';
import { safePublicFetch, type PublicFetcher } from '../publishing/public-fetch';
import { authError } from './contracts';
function clientUrl(value: string): URL {
 try { const u = new URL(value); if (u.username || u.password || u.hash || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) authError('invalid_client'); return u; } catch { return authError('invalid_client'); }
}
export async function validateClient(clientId: string, redirectUri: string, fetcher: PublicFetcher = safePublicFetch): Promise<{clientName?: string}> {
 const client = clientUrl(clientId); const redirect = clientUrl(redirectUri);
 if (client.origin === redirect.origin) return {};
 if (client.protocol !== 'https:' || redirect.protocol !== 'https:') authError('invalid_redirect_uri');
 try {
 const response = await fetcher(client.href, { headers: { accept: 'application/json, text/html' } });
 if (!response.ok) authError('invalid_client');
 const text = await response.text(); if (new TextEncoder().encode(text).length > 1024*1024) authError('invalid_client');
 if (response.headers.get('content-type')?.includes('application/json')) {
 const data = JSON.parse(text); if (data.client_id !== clientId || !Array.isArray(data.redirect_uris) || !data.redirect_uris.includes(redirectUri)) authError('invalid_redirect_uri');
 return { clientName: typeof data.client_name === 'string' ? data.client_name.slice(0,200) : undefined };
 }
 const tree = fromHtml(text); let found = false;
 function visit(node: any) { if (node.type === 'element' && ['a','link'].includes(node.tagName) && Array.isArray(node.properties?.rel) && node.properties.rel.includes('redirect_uri') && typeof node.properties.href === 'string' && new URL(node.properties.href, client).href === redirectUri) found = true; for (const child of node.children ?? []) visit(child); }
 visit(tree); if (!found) authError('invalid_redirect_uri'); return {};
 } catch (error) { if (error instanceof Error && error.message.startsWith('indieauth:')) throw error; return authError('invalid_client'); }
}
