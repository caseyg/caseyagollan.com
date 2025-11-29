import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const { topic } = await request.json();

		if (!topic) {
			return new Response(JSON.stringify({ error: 'Topic is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Get API key from platform.env (Cloudflare Workers)
		const ANTHROPIC_API_KEY = platform?.env?.ANTHROPIC_API_KEY;

		if (!ANTHROPIC_API_KEY) {
			return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
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

		const anthropic = new Anthropic({
			apiKey: ANTHROPIC_API_KEY
		});

		// Context about Casey Gollan
		const context = `Casey Gollan leads research operations, design management, and engineering management at IBM for AI productivity tools. They build AI assistants using watsonx.ai and Python ADK, including the User Insights Hub (1,000+ research reports) and Winning Products Dashboard. They serve on the board of the ResearchOps Community (18,000+ practitioners) and co-founded the School for Poetic Computation. Previously worked at NYU AI Now Institute, Figma, and ran an independent consultancy with work exhibited at Vienna Biennale, V&A Museum, and ArkDes. Interests include AI transparency, local-first tools, operations as design, knowledge systems, platform cooperatives, and educational activism.`;

		try {
			console.log('');
			console.log('🚀 ============================================');
			console.log('🚀 CACHE MISS - Calling Anthropic API');
			console.log('🚀 Topic:', topic);
			console.log('🚀 Model: claude-opus-4-5-20251101');
			console.log('🚀 Using web search tool');
			console.log('🚀 Mode: NON-STREAMING (to get citations)');
			console.log('🚀 ============================================');
			console.log('');

			const apiResponse = await anthropic.messages.create({
				model: 'claude-opus-4-5-20251101',
				max_tokens: 500,
				temperature: 1,
				messages: [
					{
						role: 'user',
						content: `Current year: ${new Date().getFullYear()}

Search the web for content connecting Casey Gollan to: ${topic}.

Context about Casey Gollan: ${context}

Respond with EXACTLY this format (no extra text, headers, or preamble):

[A single concise factual statement of 15-35 words connecting Casey to ${topic}, using citations]

Related topics: [2-3 comma-separated specific skills, technologies, or methodologies to explore next]

CRITICAL RULES:
1. Start directly with the factual statement - NO preambles like "Based on my search results", "Let me search", "I found", etc.
2. ONE sentence only for the main statement
3. Do NOT include your search process, thinking, or multiple attempts
4. Do NOT use markdown headers (##) or bullet points
5. Do NOT say you cannot find information - if you can't find a connection, write: "No documented connection found between Casey Gollan and ${topic}."
6. Use proper verb tense: present for current roles, past for previous work
7. Always cite your sources when making factual claims
8. Be direct and factual - no explanatory phrases

EXAMPLES OF GOOD RESPONSES:
Casey Gollan teaches at The Cooper Union and lectures on AI transparency and platform cooperatives.

Related topics: AI Ethics, Educational Activism, Design Pedagogy

EXAMPLES OF BAD RESPONSES (DO NOT DO THIS):
- "Based on my search results, Casey Gollan teaches..." ❌
- "Let me search for Casey Gollan's connection to..." ❌
- "I found some results mentioning..." ❌
- Multiple paragraphs or attempts ❌

Source preferences (in order):
- caseyagollan.com and cag.wiki
- Official pages from Casey's roles at: IBM, School for Poetic Computation, Cooper Union, AI Now Institute
- Academic papers, articles, or interviews featuring Casey's work
- Casey's social media and professional profiles`
					}
				],
				tools: [
					{
						type: 'web_search_20250305',
						name: 'web_search'
					}
				],
				stream: false
			});

			console.log('📦 Response received, processing content blocks...');
			console.log('📦 Full response:', JSON.stringify(apiResponse, null, 2));

			// Extract data from response
			let fullText = '';
			let searchResults: any[] = [];
			let citationsMap = new Map<string, { url: string; title: string; page_age: string | null; cited_text: string | null }>();
			let foundSearchResults = false;

			// Process all content blocks
			for (const block of apiResponse.content) {
				console.log('📦 Block type:', (block as any).type);

				// Extract web search results
				if ((block as any).type === 'web_search_tool_result') {
					searchResults = (block as any).content || [];
					foundSearchResults = true;
					console.log('🔍 Found search results:', searchResults.length);
				}

				// Skip thinking blocks - we only want the final text response
				if ((block as any).type === 'thinking') {
					console.log('🤔 Skipping thinking block');
					continue;
				}

				// Extract text and citations from text blocks
				// Only collect text AFTER we've seen search results (to skip thinking text)
				if ((block as any).type === 'text' && foundSearchResults) {
					fullText += (block as any).text || '';

					if ((block as any).citations) {
						const citations = (block as any).citations;
						console.log('📎 Found citations in text block:', citations.length);
						for (const citation of citations) {
							if (citation.type === 'web_search_result_location') {
								console.log('  - Citation:', citation.title, '|', citation.cited_text?.substring(0, 50) + '...');
								citationsMap.set(citation.url, {
									url: citation.url,
									title: citation.title || new URL(citation.url).hostname,
									page_age: citation.page_age || null,
									cited_text: citation.cited_text || null
								});
							}
						}
					}
				}
			}

			// Parse the text response to extract insight and recommended topics
			console.log('📝 Full text response:', fullText);

			// Split on "Related topics:" to separate insight from topics
			const parts = fullText.split(/Related topics:/i);
			let insightText = parts[0]?.trim() || '';
			let recommendedTopics: string[] = [];

			if (parts[1]) {
				// Parse comma-separated topics
				recommendedTopics = parts[1]
					.split(',')
					.map(t => t.trim())
					.filter(t => t.length > 0)
					.slice(0, 3); // Max 3 topics
			}

			console.log('💡 Extracted insight:', insightText.substring(0, 100));
			console.log('💡 Extracted topics:', recommendedTopics);

			// Extract sources from citations or fall back to search results
			let sources: Array<{ url: string; title: string; page_age: string | null; cited_text: string | null }> = [];
			if (citationsMap.size > 0) {
				sources = Array.from(citationsMap.values()).slice(0, 5);
			} else if (searchResults && searchResults.length > 0) {
				// Fallback: use search results if no citations were found
				sources = searchResults
					.slice(0, 5)
					.map((result: any) => ({
						url: result.url || '',
						title: result.title || new URL(result.url).hostname,
						page_age: result.page_age || null,
						cited_text: null // No cited_text in search results
					}))
					.filter((s: any) => s.url);
			}

			console.log('');
			console.log('✅ ============================================');
			console.log('✅ API CALL COMPLETE');
			console.log('✅ Search results:', searchResults.length);
			console.log('✅ Citations found:', citationsMap.size);
			console.log('✅ Final insight:', insightText.substring(0, 80) + '...');
			console.log('✅ Recommended topics:', recommendedTopics.length);
			console.log('✅ Sources:', sources.length);
			if (sources.length > 0) {
				console.log('✅ Sources details:');
				sources.forEach((s, i) => {
					console.log(`  ${i + 1}. ${s.title}`);
					console.log(`     URL: ${s.url}`);
					console.log(`     Page age: ${s.page_age || 'N/A'}`);
					console.log(`     Cited text: ${s.cited_text ? s.cited_text.substring(0, 80) + '...' : 'N/A'}`);
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
	} catch (error) {
		console.error('Error generating insight:', error);
		return new Response(JSON.stringify({ error: 'Failed to generate insight' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
