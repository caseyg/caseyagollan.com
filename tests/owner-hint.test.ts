import { describe, expect, it } from 'bun:test';
import { withOwnerHint } from '../src/lib/server/owner-hint';

const SESSION = '__Host-indieauth-session';
const request = (cookie?: string) => new Request('https://caseyagollan.com/tables/abc', cookie ? { headers: { cookie } } : {});
const response = (...cookies: string[]) => {
	const headers = new Headers();
	for (const value of cookies) headers.append('set-cookie', value);
	return new Response('ok', { headers });
};
const hints = (res: Response) => res.headers.getSetCookie().filter((value) => value.startsWith('owner-hint='));

describe('owner hint cookie', () => {
	it('is set beside the session at sign-in, with the same lifetime and readable by scripts', () => {
		const [hint] = hints(withOwnerHint(request(), response(`${SESSION}=tok; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600`)));
		expect(hint).toBe('owner-hint=1; Path=/; Secure; SameSite=Lax; Max-Age=1209600');
		expect(hint).not.toContain('HttpOnly');
	});

	it('is cleared when the session is', () => {
		expect(hints(withOwnerHint(request(`${SESSION}=tok; owner-hint=1`), response(`${SESSION}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)))).toEqual(['owner-hint=1; Path=/; Secure; SameSite=Lax; Max-Age=0']);
	});

	it('is added for a session from before the hint existed', () => {
		expect(hints(withOwnerHint(request(`${SESSION}=tok`), response()))).toHaveLength(1);
	});

	it('is left alone for visitors and for browsers that already have it', () => {
		expect(hints(withOwnerHint(request(), response()))).toEqual([]);
		expect(hints(withOwnerHint(request(`theme=dark; ${SESSION}=tok; owner-hint=1`), response()))).toEqual([]);
	});

	it('copes with responses whose headers are immutable', async () => {
		const frozen = await fetch('data:text/plain,ok');
		const out = withOwnerHint(request(`${SESSION}=tok`), frozen);
		expect(hints(out)).toHaveLength(1);
		expect(await out.text()).toBe('ok');
	});
});
