import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ setHeaders }) => {
 setHeaders({
  'cache-control': 'no-store',
  'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow'
 });
 return {};
};
