/**
 * Builds a map (`table_map`'s pipeline) outside the Worker, to look at each stage:
 *
 *   bun utils/map-try.ts readwise --days 7
 *   bun utils/map-try.ts readwise arena:calm-technology raindrop:all --days 30 --redo quotes,graph
 *
 * Stage files (docs, links, quotes, images, graph) are kept under `.map-cache/`, as the Worker
 * keeps them in R2, so a second run reads only what changed. A drawing of the graph is written
 * beside them as `map.svg`. Sources are read live: set READWISE_ACCESS_TOKEN, RAINDROP_TOKEN and
 * ARENA_PAT as needed, and INFERENCE_COOP_API_KEY for the model's part (quotes, checking pictures).
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildMap, MAP_STAGES, mapName, type MapStage } from '../src/lib/server/maps/pipeline';
import { mapModel } from '../src/lib/server/maps/model';
import { MAP_SOURCES, type MapAsk, type MapSource } from '../src/lib/server/maps/types';

const ROOT = process.env.MAP_CACHE || '.map-cache';

/** Just enough of an R2 bucket, on disk. */
function diskBucket(root: string): R2Bucket {
	const path = (key: string) => join(root, key);
	const meta = (key: string) => `${path(key)}.meta.json`;
	const object = async (key: string) => {
		const body = await readFile(path(key)).catch(() => null);
		if (!body) return null;
		const extra = JSON.parse(await readFile(meta(key), 'utf8').catch(() => '{}'));
		return { key, ...extra, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(body.toString('utf8')), text: async () => body.toString('utf8') };
	};
	return {
		get: object,
		head: async (key: string) => ((await stat(path(key)).catch(() => null)) ? object(key) : null),
		put: async (key: string, value: string | ArrayBuffer | Uint8Array, options: { httpMetadata?: unknown; customMetadata?: unknown } = {}) => {
			await mkdir(dirname(path(key)), { recursive: true });
			await writeFile(path(key), typeof value === 'string' ? value : new Uint8Array(value as ArrayBuffer));
			await writeFile(meta(key), JSON.stringify({ httpMetadata: options.httpMetadata, customMetadata: options.customMetadata }));
		}
	} as unknown as R2Bucket;
}

/** The Worker's IMAGES binding, stood in for by sharp: fit a picture to a box and hand back a JPEG. */
const images = {
	input: (stream: ReadableStream) => ({
		transform: (shape: { width: number; height: number; fit: 'cover' }) => ({
			output: async () => {
				const { default: sharp } = await import('sharp');
				const shrunk = await sharp(Buffer.from(await new Response(stream).arrayBuffer())).resize(shape.width, shape.height, { fit: shape.fit }).jpeg({ quality: 78 }).toBuffer();
				return { response: () => new Response(shrunk) };
			}
		})
	})
} as unknown as ImagesBinding;

const args = process.argv.slice(2);
const flag = (name: string) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args.splice(at, 2)[1] : undefined; };
const days = Number(flag('days')) || undefined;
const redo = (flag('redo') ?? '').split(',').filter((stage): stage is MapStage => (MAP_STAGES as readonly string[]).includes(stage));
const similar = flag('similar'), spread = flag('spread');
const asks: MapAsk[] = args.map((arg) => { const [source, ...rest] = arg.split(':'); return { source: source as MapSource, ...(rest.length ? { in: rest.join(':') } : {}) }; }).filter((ask) => (MAP_SOURCES as readonly string[]).includes(ask.source));
if (!asks.length) { console.error('Name at least one source: readwise, arena:<channel>, raindrop:<collection>, site'); process.exit(1); }

const env = { READWISE_ACCESS_TOKEN: process.env.READWISE_ACCESS_TOKEN, RAINDROP_TOKEN: process.env.RAINDROP_TOKEN, ARENA_PAT: process.env.ARENA_PAT };
const started = Date.now();
const map = await buildMap({ asks, days, redo, ...(similar ? { similar: Number(similar) } : {}), ...(spread ? { spread: Number(spread) } : {}) }, {
	saves: { env }, origin: 'https://caseyagollan.com/', assets: { fetch: (request: Request) => fetch(new Request(request, { redirect: 'follow' })) } as unknown as Fetcher,
	state: diskBucket(ROOT), pictures: diskBucket(ROOT), images, model: mapModel({ INFERENCE_COOP_API_KEY: process.env.INFERENCE_COOP_API_KEY, CHAT_INFERENCE_URL: process.env.CHAT_INFERENCE_URL }),
	now: new Date(), timeZone: 'America/New_York'
});

const strong = map.links.edges.filter((edge) => edge.strong), weak = map.links.edges.filter((edge) => !edge.strong);
const quoted = Object.values(map.quotes.quotes);
console.log(`${mapName({ asks, days })} (${map.key}) in ${((Date.now() - started) / 1000).toFixed(1)}s; ran: ${map.ran.join(', ') || 'nothing'}`);
console.log(`docs ${map.docs.docs.length}; edges ${strong.length} strong (${['link', 'cites', 'same'].map((kind) => `${strong.filter((edge) => edge.kind === kind).length} ${kind}`).join(', ')}), ${weak.length} weak (${['similar', 'site'].map((kind) => `${weak.filter((edge) => edge.kind === kind).length} ${kind}`).join(', ')})`);
console.log(`quotes ${quoted.filter(Boolean).length}/${quoted.length} (${['highlight', 'model', 'rule'].map((from) => `${quoted.filter((quote) => quote?.from === from).length} ${from}`).join(', ')}); pictures ${map.images.kept} kept, ${map.images.tiles} tiles, ${map.images.people} of people, ${map.images.unchecked} unchecked`);
console.log(`layout ${map.graph.width}×${map.graph.height}, ${map.graph.crossings} crossings, seed ${map.graph.seed}; languages ${JSON.stringify(map.links.languages)}`);
for (const note of map.docs.notes) console.log(`note: ${note}`);
for (const cite of map.links.citations.slice(0, 8)) console.log(`cited by ${cite.by.length}: ${cite.url}`);
if (process.env.MAP_QUOTES) for (const doc of map.docs.docs) console.log(`\n${doc.title.slice(0, 70)}\n  ${map.quotes.quotes[doc.id]?.from ?? '—'}: ${map.quotes.quotes[doc.id]?.text ?? ''}`);

// A drawing of the layout: likeness in grey underneath, the backbone in blue, cards on top.
const escape = (text: string) => text.replace(/[&<>"]/g, (mark) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[mark]!);
const middle = (card: (typeof map.graph.cards)[number]) => `${card.x + card.w / 2},${card.y + card.h / 2}`;
const svg = [
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 ${map.graph.width + 80} ${map.graph.height + 80}" font-family="sans-serif" font-size="13">`,
	`<rect x="-40" y="-40" width="100%" height="100%" fill="#e8e8e8"/>`,
	...map.graph.links.map((link) => `<path d="M${middle(map.graph.cards[link.from])} L${middle(map.graph.cards[link.to])}" stroke="${link.strong ? '#0000ee' : '#9a9a9a'}" stroke-width="${link.strong ? 3 : 1.5}" ${link.strong ? '' : 'stroke-dasharray="2 6"'} fill="none"/>`),
	...map.graph.cards.map((card) => `<g><rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="4" fill="${card.block.marked ? '#fff3a8' : '#fff'}" stroke="#bbb"/><rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.block.form === 'card' ? 140 : 0}" fill="${card.block.image ? '#c9d6e8' : '#ddd'}"/><text x="${card.x + 10}" y="${card.y + (card.block.form === 'card' ? 162 : 24)}" font-weight="bold">${escape(card.block.title.slice(0, 34))}</text><text x="${card.x + 10}" y="${card.y + (card.block.form === 'card' ? 184 : 46)}" fill="#555">${escape((card.block.quote ?? '').slice(0, 40))}</text></g>`),
	'</svg>'
].join('\n');
await mkdir(ROOT, { recursive: true });
await writeFile(join(ROOT, 'map.svg'), svg);
console.log(`drawn to ${join(ROOT, 'map.svg')}`);
