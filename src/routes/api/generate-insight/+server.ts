import type { RequestHandler } from './$types';
import OpenAI from 'openai';

interface KagiSearchResult {
	url: string;
	title: string;
	snippet?: string;
}

async function kagiSearch(query: string, apiKey: string): Promise<KagiSearchResult[]> {
	try {
		const response = await fetch('https://kagi.com/api/v1/search', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ query })
		});

		if (!response.ok) {
			console.error('Kagi search error:', response.status, response.statusText);
			return [];
		}

		const data = await response.json() as any;
		const results: any[] = data?.data?.search || [];

		return results
			.filter((r: any) => r.url && r.title)
			.slice(0, 5)
			.map((r: any) => ({
				url: r.url,
				title: stripHtml(r.title),
				snippet: stripHtml(r.snippet || '')
			}));
	} catch (e) {
		console.error('Kagi search failed:', e);
		return [];
	}
}

// Kagi snippets contain <strong> markup; strip it for clean text
function stripHtml(text: string): string {
	return text
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();
}

function buildPrompt(topic: string, searchResults: KagiSearchResult[], context: string): string {
	const searchContext = searchResults.length > 0
		? searchResults.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`).join('\n\n')
		: 'No search results found.';

	return `Current year: ${new Date().getFullYear()}

Context about Casey Gollan: ${context}

Web search results for "Casey Gollan ${topic}":
${searchContext}

Based on the search results above, write a single concise factual statement connecting Casey Gollan to "${topic}".

Respond with EXACTLY this format (no extra text, headers, or preamble):

[A single concise factual statement of 15-35 words connecting Casey to ${topic}]

Related topics: [2-3 comma-separated specific skills, technologies, or methodologies to explore next]

CRITICAL RULES:
1. Start directly with the factual statement - NO preambles like "Based on my search results", "Let me search", "I found", etc.
2. ONE sentence only for the main statement
3. Do NOT include your search process, thinking, or multiple attempts
4. Do NOT use markdown headers (##) or bullet points
5. Do NOT say you cannot find information - if you can't find a connection, write: "No documented connection found between Casey Gollan and ${topic}."
6. Use proper verb tense: present for current roles, past for previous work
7. Be direct and factual - no explanatory phrases

EXAMPLES OF GOOD RESPONSES:
Casey Gollan teaches at The Cooper Union and lectures on AI transparency and platform cooperatives.

Related topics: AI Ethics, Educational Activism, Design Pedagogy

EXAMPLES OF BAD RESPONSES (DO NOT DO THIS):
- "Based on my search results, Casey Gollan teaches..." ❌
- "Let me search for Casey Gollan's connection to..." ❌
- "I found some results mentioning..." ❌
- Multiple paragraphs or attempts ❌`;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const { topic } = await request.json();

		if (!topic) {
			return new Response(JSON.stringify({ error: 'Topic is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Get API keys from platform.env (Cloudflare Workers)
		const INFERENCE_COOP_API_KEY = platform?.env?.INFERENCE_COOP_API_KEY;
		const KAGI_API_KEY = platform?.env?.KAGI_API_KEY;

		if (!INFERENCE_COOP_API_KEY) {
			return new Response(JSON.stringify({ error: 'AI inference API key not configured' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (!KAGI_API_KEY) {
			return new Response(JSON.stringify({ error: 'Search API key not configured' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Access KV cache if available
		const kv = platform?.env?.INSIGHT_CACHE;
		const cacheKey = `insight:${topic.toLowerCase().trim()}`;

		// Check cache first
		if (kv) {
			try {
				const cached = await kv.get(cacheKey, { type: 'json' }) as any;
				if (cached && cached.timestamp) {
					const age = Date.now() - cached.timestamp;
					const oneDay = 24 * 60 * 60 * 1000;

					if (age < oneDay) {
						const ageMinutes = Math.round(age / 1000 / 60);
						console.log('');
						console.log('🎯 ============================================');
						console.log('🎯 CACHE HIT - Serving from KV');
						console.log('🎯 Topic:', topic);
						console.log('🎯 Age:', ageMinutes, 'minutes');
						console.log('🎯 ============================================');
						console.log('');

						return new Response(JSON.stringify({
							topic: cached.topic,
							insight: cached.insight,
							recommendedTopics: cached.recommendedTopics,
							sources: cached.sources,
							cached: true,
							ageMinutes
						}), {
							headers: {
								'Content-Type': 'application/json',
								'X-Cache-Status': 'HIT'
							}
						});
					} else {
						console.log('⏰ Cache expired for topic:', topic, '(age:', Math.round(age / 1000 / 60), 'minutes)');
					}
				}
			} catch (e) {
				console.error('KV cache read error:', e);
				// Continue to API call on cache error
			}
		}

		const context = `Casey Gollan leads research operations, design management, and engineering management at IBM for AI productivity tools. They build AI assistants using watsonx.ai and Python ADK, including the User Insights Hub (1,000+ research reports) and Winning Products Dashboard. They serve on the board of the ResearchOps Community (18,000+ practitioners) and co-founded the School for Poetic Computation. Previously worked at NYU AI Now Institute, Figma, and ran an independent consultancy with work exhibited at Vienna Biennale, V&A Museum, and ArkDes. Interests include AI transparency, local-first tools, operations as design, knowledge systems, platform cooperatives, and educational activism.`;

		console.log('');
		console.log('🚀 ============================================');
		console.log('🚀 CACHE MISS - Calling Kagi + inference.coop');
		console.log('🚀 Topic:', topic);
		console.log('🚀 Model: greenpt/deepseek-v4.1-flash');
		console.log('🚀 ============================================');
		console.log('');

		// Fetch search results from Kagi
		const searchResults = await kagiSearch(`Casey Gollan ${topic}`, KAGI_API_KEY);
		console.log('🔍 Kagi search results:', searchResults.length);

		const openai = new OpenAI({
			apiKey: INFERENCE_COOP_API_KEY,
			baseURL: 'https://gateway.inference.coop/v1'
		});

		const completion = await openai.chat.completions.create({
			model: 'greenpt/deepseek-v4.1-flash',
			// Reasoning models emit chain-of-thought before the answer; 500 was too
			// small and produced empty content (finish_reason: 'length')
			max_tokens: 2000,
			temperature: 1,
			messages: [
				{
					role: 'user',
					content: buildPrompt(topic, searchResults, context)
				}
			]
		});

		const fullText = completion.choices[0]?.message?.content || '';
		const finishReason = completion.choices[0]?.finish_reason;
		console.log('📝 Full text response:', fullText);
		console.log('📝 Finish reason:', finishReason);

		// Split on "Related topics:" to separate insight from topics
		const parts = fullText.split(/Related topics:/i);
		let insightText = parts[0]?.trim() || '';
		let recommendedTopics: string[] = [];

		if (parts[1]) {
			recommendedTopics = parts[1]
				.split(',')
				.map(t => t.trim())
				.filter(t => t.length > 0)
				.slice(0, 3); // Max 3 topics
		}

		console.log('💡 Extracted insight:', insightText.substring(0, 100));
		console.log('💡 Extracted topics:', recommendedTopics);

		// Guard: never serve or cache an empty insight. Reasoning models can
		// exhaust the token budget before writing content (finish_reason: 'length').
		if (!insightText) {
			console.error('❌ Empty insight from model. finish_reason:', finishReason);
			return new Response(JSON.stringify({ error: 'Failed to generate insight' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Build sources from Kagi search results
		const sources = searchResults
			.slice(0, 5)
			.map((r) => ({
				url: r.url,
				title: r.title,
				page_age: null,
				cited_text: r.snippet || null
			}));

		console.log('');
		console.log('✅ ============================================');
		console.log('✅ API CALL COMPLETE');
		console.log('✅ Search results:', searchResults.length);
		console.log('✅ Final insight:', insightText.substring(0, 80) + '...');
		console.log('✅ Recommended topics:', recommendedTopics.length);
		console.log('✅ Sources:', sources.length);
		if (sources.length > 0) {
			console.log('✅ Sources details:');
			sources.forEach((s, i) => {
				console.log(`  ${i + 1}. ${s.title}`);
				console.log(`     URL: ${s.url}`);
				console.log(`     Snippet: ${s.cited_text ? s.cited_text.substring(0, 80) + '...' : 'N/A'}`);
			});
		}
		console.log('✅ ============================================');
		console.log('');

		// Prepare response data
		const responseData = {
			topic,
			insight: insightText,
			recommendedTopics,
			sources
		};

		// Save to KV cache
		if (kv) {
			try {
				await kv.put(cacheKey, JSON.stringify({
					timestamp: Date.now(),
					...responseData
				}), {
					expirationTtl: 86400 // 24 hours
				});
				console.log('💾 Saved to KV cache:', cacheKey, 'TTL: 24h');
			} catch (e) {
				console.error('❌ KV cache write error:', e);
				// Don't fail the request on cache write error
			}
		}

		return new Response(JSON.stringify(responseData), {
			headers: {
				'Content-Type': 'application/json'
			}
		});
	} catch (error) {
		console.error('Error generating insight:', error);
		return new Response(JSON.stringify({ error: 'Failed to generate insight' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
