import { describe, expect, test } from 'bun:test';
import { TLDRAW_LICENSE_KEY, TLDRAW_PREVIEW_LICENSE_KEY, tldrawLicenseKey, tldrawLicensed } from '../src/lib/tldraw-license';

const PREVIEW = 'tldraw-2026-12-10/abc.def';
const HOST = 'some-branch-caseyagollan.caseygollan.workers.dev';

describe('tldraw licence', () => {
	test('no preview key outside a preview build', () => {
		expect(TLDRAW_PREVIEW_LICENSE_KEY).toBe('');
		expect(tldrawLicenseKey(HOST)).toBe(TLDRAW_LICENSE_KEY);
		expect(tldrawLicensed(HOST)).toBe(false);
	});

	test('the site and localhost always use the site key', () => {
		for (const host of ['caseyagollan.com', 'www.caseyagollan.com', 'localhost', '127.0.0.1']) {
			expect(tldrawLicenseKey(host, PREVIEW)).toBe(TLDRAW_LICENSE_KEY);
			expect(tldrawLicensed(host, '')).toBe(true);
		}
	});

	test('other hosts use the preview key until it expires', () => {
		expect(tldrawLicenseKey(HOST, PREVIEW)).toBe(PREVIEW);
		expect(tldrawLicensed(HOST, PREVIEW, new Date('2026-12-10T12:00:00Z'))).toBe(true);
		expect(tldrawLicensed(HOST, PREVIEW, new Date('2026-12-11T00:00:01Z'))).toBe(false);
	});
});
