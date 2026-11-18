import { expect, test } from 'bun:test';
import { fediverseHandle, SITE_IDENTITY } from '../src/lib/identity';
import { openSearchDescription } from '../src/lib/opensearch';

test('the fediverse handle comes from the Mastodon profile link', () => {
	expect(fediverseHandle()).toBe('@caseyg@social.coop');
	expect(fediverseHandle({ ...SITE_IDENTITY, profiles: [{ label: 'GitHub', href: 'https://github.com/caseyg' }] })).toBeUndefined();
});

test('the OpenSearch description searches the homepage with ?q=', () => {
	const xml = openSearchDescription('https://example.com');
	expect(xml).toContain('<ShortName>Casey Gollan</ShortName>');
	expect(xml).toContain('template="https://example.com/?q={searchTerms}"');
	expect(xml).toContain('rel="self" template="https://example.com/opensearch.xml"');
});
