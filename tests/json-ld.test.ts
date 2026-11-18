import { describe, expect, test } from 'bun:test';
import { homeJsonLd, jsonLdScript, PERSON_ID, postJsonLd } from '../src/lib/json-ld';
import type { Post } from '../src/lib/posts-types';

const base: Post = { slug: 'x', type: 'note', date: '2026-11-17T12:00:00-05:00', content: '', filePath: '' };
const url = 'https://caseyagollan.com/2026/11/17/x/';

describe('schema.org JSON-LD', () => {
	test('the homepage names the person and the site search', () => {
		const graph = homeJsonLd()['@graph'] as Record<string, unknown>[];
		expect(graph[0]).toMatchObject({ '@type': 'Person', '@id': PERSON_ID, name: 'Casey Gollan' });
		expect((graph[0].sameAs as string[])).toContain('https://social.coop/@caseyg');
		expect(graph[1]).toMatchObject({ '@type': 'WebSite', potentialAction: { target: 'https://caseyagollan.com/?q={search_term_string}' } });
	});

	test('articles are BlogPostings and notes SocialMediaPostings, by the site owner', () => {
		const article = postJsonLd({ ...base, type: 'article', title: 'Hello', category: ['web', 'indieweb'], photo: [{ url: '/media/a.jpg' }] }, { url, description: 'Intro' });
		expect(article).toMatchObject({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: 'Hello', author: { '@type': 'Person', '@id': PERSON_ID, name: 'Casey Gollan' }, keywords: 'web, indieweb', image: ['https://caseyagollan.com/media/a.jpg'], datePublished: base.date, description: 'Intro' });
		const note = postJsonLd(base, { url });
		expect(note['@type']).toBe('SocialMediaPosting');
		expect(note).not.toHaveProperty('headline');
		expect(note).not.toHaveProperty('description');
	});

	test('recipes, events, reviews and venues use their own types', () => {
		expect(postJsonLd({ ...base, type: 'recipe', microformatType: 'h-recipe', title: 'Toast', properties: { ingredient: ['Bread', 'Butter'], yield: ['1'], duration: ['PT5M'] } }, { url, description: 'Toast it.' }))
			.toMatchObject({ '@type': 'Recipe', name: 'Toast', recipeIngredient: ['Bread', 'Butter'], recipeYield: '1', totalTime: 'PT5M', recipeInstructions: 'Toast it.' });
		expect(postJsonLd({ ...base, type: 'event', microformatType: 'h-event', title: 'Camp', properties: { start: ['2026-12-01T10:00:00-05:00'], location: [{ type: ['h-card'], properties: { name: ['Hall'], locality: ['NYC'] } }] } }, { url }))
			.toMatchObject({ '@type': 'Event', name: 'Camp', startDate: '2026-12-01T10:00:00-05:00', location: { '@type': 'Place', name: 'Hall', address: { addressLocality: 'NYC' } } });
		expect(postJsonLd({ ...base, type: 'review', microformatType: 'h-review', properties: { item: [{ type: ['h-product'], properties: { name: ['Kettle'], url: ['https://example.org/k'] } }], rating: [4], best: [5], worst: [1] } }, { url }))
			.toMatchObject({ '@type': 'Review', itemReviewed: { name: 'Kettle', url: 'https://example.org/k' }, reviewRating: { ratingValue: 4, bestRating: 5, worstRating: 1 } });
		expect(postJsonLd({ ...base, type: 'venue', microformatType: 'h-card', title: 'The Strand', properties: { 'street-address': ['828 Broadway'], latitude: [40.73], longitude: [-73.99] } }, { url }))
			.toMatchObject({ '@type': 'Place', name: 'The Strand', address: { streetAddress: '828 Broadway' }, geo: { latitude: 40.73, longitude: -73.99 } });
	});

	test('drops values it cannot vouch for', () => {
		const review = postJsonLd({ ...base, type: 'recipe', microformatType: 'h-recipe', title: 'T', properties: { ingredient: ['x'], duration: ['ten minutes'] }, photo: [{ url: 'javascript:alert(1)' }] }, { url });
		expect(review).not.toHaveProperty('totalTime');
		expect(review).not.toHaveProperty('image');
	});

	test('the script element cannot be closed by post text', () => {
		const script = jsonLdScript(postJsonLd({ ...base, type: 'article', title: '</script><script>alert(1)</script>' }, { url }));
		expect(script.match(/<\/script>/g)).toHaveLength(1);
		expect(JSON.parse(script.slice(script.indexOf('>') + 1, -'</script>'.length)).headline).toBe('</script><script>alert(1)</script>');
	});
});
