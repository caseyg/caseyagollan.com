/**
 * What the homepage's insight endpoints accept and hand back. Anyone can call them, and what
 * they return is cached for the next visitor, so everything is bounded and checked here.
 */
import { cleanSource } from './graph-curation';
import type { InsightSource } from './insight-types';

export const MAX_TOPIC = 80;
export const MAX_TOPICS = 24;
export const MAX_INSIGHT = 1_200;
export const MAX_DOCUMENT = 2_500;

/** The bio the homepage starts from. A bio is only cached when it grew from this or from a cached one. */
export const HOME_BIO =
	"Casey is a Senior Manager of Engineering in IBM's Product Excellence Office, leading a team that builds AI productivity platforms for hundreds of product teams across one of the largest and oldest technology companies.\n\nPreviously, he co-founded the School for Poetic Computation and led operations at NYU's AI Now Institute. He serves on the ResearchOps Community board and is a member of ChaCha Club.";

/** A topic as the graph names one: a short single line. Null for anything else. */
export function cleanTopic(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const topic = value.replace(/\s+/g, ' ').trim();
	// eslint-disable-next-line no-control-regex
	if (!topic || topic.length > MAX_TOPIC || /[\u0000-\u001f\u007f<>{}`]/.test(topic)) return null;
	return topic;
}

export function cleanTopics(value: unknown, max = MAX_TOPICS): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map(cleanTopic).filter((topic): topic is string => !!topic))].slice(0, max);
}

/** Sources a page may link: web addresses only, so a stored `javascript:` link can never be opened. */
export function cleanSources(value: unknown, max = 8): InsightSource[] {
	if (!Array.isArray(value)) return [];
	return value.map(cleanSource).filter((source): source is InsightSource => !!source).slice(0, max);
}

export const insightKey = (topic: string) => `insight:${topic.toLowerCase().trim()}`;
export const bioKey = (topics: string[]) => `bio:${topics.toSorted().join(',')}`;
