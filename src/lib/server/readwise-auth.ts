import { error } from '@sveltejs/kit';
import { authStore } from './indieauth/contracts';
import type { PublishingEnvironment } from './publishing/config';

export async function readwiseSession(request: Request, env: PublishingEnvironment = {}) {
 const store = authStore(env);
 if (!store) error(503, 'Owner authentication is not configured');
 const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('__Host-indieauth-session='))?.slice('__Host-indieauth-session='.length);
 const session = token ? await store.invoke('session', { token }) : null;
 return session;
}
