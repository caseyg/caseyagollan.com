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
						console.log('🎯 Events to replay:', cached.events?.length || 0);
						console.log('🎯 ============================================');
						console.log('');

						// Replay cached stream with cache marker
						return new Response(
							new ReadableStream({
								async start(controller) {
									const encoder = new TextEncoder();

									// Send cache marker as first event
									controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'cache_hit', topic, ageMinutes })}\n\n`));

									// Replay all cached events
									for (const event of cached.events) {
										controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
										// Small delay to simulate streaming
										await new Promise(resolve => setTimeout(resolve, 10));
									}

									controller.close();
								}
							}),
							{
								headers: {
									'Content-Type': 'text/event-stream',
									'Cache-Control': 'no-cache',
									'Connection': 'keep-alive',
									'X-Cache-Status': 'HIT'
								}
							}
						);
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

		// Create a streaming response
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				try {
					console.log('');
					console.log('🚀 ============================================');
					console.log('🚀 CACHE MISS - Calling Anthropic API');
					console.log('🚀 Topic:', topic);
					console.log('🚀 Model: claude-haiku-4-5-20251001');
					console.log('🚀 Using web search tool');
					console.log('🚀 ============================================');
					console.log('');
					const apiStream = await anthropic.messages.create({
						model: 'claude-haiku-4-5-20251001',
						max_tokens: 500,
						temperature: 1,
						messages: [
							{
								role: 'user',
								content: `Current year: ${new Date().getFullYear()}

Search the web for content connecting Casey Gollan to: ${topic}.

Context about Casey Gollan: ${context}

Then provide:
1. A concise insight (15-30 words) connecting Casey to ${topic} based on what you find
2. 2-3 recommended related topics to explore next (specific skills, technologies, methodologies, or areas that would expand on this insight)

IMPORTANT: Pay attention to verb tense. If Casey currently works somewhere or is currently involved, use present tense. If it's a past role or project, use past tense.

Source preferences (in order):
- caseyagollan.com and cag.wiki
- Official pages from Casey's roles at: IBM, School for Poetic Computation, Cooper Union, AI Now Institute
- Academic papers, articles, or interviews featuring Casey's work
- Casey's social media and professional profiles

Use the provide_insight tool to return your response with both insight and recommended_topics.`
							}
						],
						tools: [
							{
								type: 'web_search_20250305',
								name: 'web_search'
							},
							{
								type: 'custom',
								name: 'provide_insight',
								description: 'Provide a concise insight connecting Casey Gollan to the topic based on search results, plus recommended related topics',
								input_schema: {
									type: 'object',
									properties: {
										insight: {
											type: 'string',
											description: 'A brief factual statement (15-30 words) connecting Casey Gollan to the topic. No meta-commentary, no attribution phrases.'
										},
										recommended_topics: {
											type: 'array',
											description: 'Array of 2-3 related topics/concepts that would be interesting to explore next based on this insight. Should be specific skills, technologies, methodologies, or areas of interest related to Casey\'s work.',
											items: {
												type: 'string'
											},
											minItems: 2,
											maxItems: 3
										}
									},
									required: ['insight', 'recommended_topics']
								}
							}
						],
						stream: true
					});

					let insightText = '';
					let searchQuery = '';
					let searchResults: any[] = [];
					let currentBlockIndex = -1;
					let hasSeenToolUse = false;
					let textBlocksAfterTools: number[] = [];
					let jsonAccumulator = '';
					let insightToolIndex = -1;
					let recommendedTopics: string[] = [];
					let sources: Array<{ url: string; title: string }> = [];

					// Capture all events for caching
					const capturedEvents: any[] = [];

					// Forward all stream events to client for visualization
					for await (const event of apiStream) {
						// Forward the raw event to client
						const rawEventData = { type: 'raw_event', event };
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(rawEventData)}\n\n`)
						);
						capturedEvents.push(rawEventData);

						// Also process events for our own tracking
						if (event.type === 'content_block_start') {
							currentBlockIndex = event.index;
							const block = event.content_block;
							// Removed verbose logging - just track internally
							const blockStartData = { type: 'block_start', blockType: block.type, index: event.index };
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(blockStartData)}\n\n`)
							);
							capturedEvents.push(blockStartData);

							// Track when we've seen tool use
							if (block.type === 'server_tool_use') {
								hasSeenToolUse = true;
							}

							// Check if this is the provide_insight custom tool
							if (block.type === 'tool_use' && (block as any).name === 'provide_insight') {
								insightToolIndex = event.index;
							}

							// Track text blocks that come after tool use
							if (block.type === 'text' && hasSeenToolUse) {
								textBlocksAfterTools.push(event.index);
							}

							// Handle web search tool results
							if (block.type === 'web_search_tool_result') {
								searchResults = (block as any).content || [];
								const searchResultsData = { type: 'search_results', results: searchResults };
								controller.enqueue(
									encoder.encode(`data: ${JSON.stringify(searchResultsData)}\n\n`)
								);
								capturedEvents.push(searchResultsData);
							}
						} else if (event.type === 'content_block_delta') {
							if (event.delta.type === 'text_delta') {
								const isAfterTools = textBlocksAfterTools.includes(event.index);

								if (isAfterTools) {
									// This is final insight text - accumulate it
									insightText += event.delta.text;
									const textData = { type: 'text', text: event.delta.text, isFinal: true, blockIndex: event.index };
									controller.enqueue(
										encoder.encode(`data: ${JSON.stringify(textData)}\n\n`)
									);
									capturedEvents.push(textData);
								} else {
									// This is thinking text before tools - don't accumulate
									const thinkingData = { type: 'text_thinking', text: event.delta.text, isFinal: false, blockIndex: event.index };
									controller.enqueue(
										encoder.encode(`data: ${JSON.stringify(thinkingData)}\n\n`)
									);
									capturedEvents.push(thinkingData);
								}
							} else if (event.delta.type === 'input_json_delta') {
								// Check if this is from the provide_insight tool
								if (event.index === insightToolIndex) {
									// Accumulate and parse JSON from the provide_insight tool
									jsonAccumulator += event.delta.partial_json || '';

									// Try to parse accumulated JSON
									try {
										const parsed = JSON.parse(jsonAccumulator);
										if (parsed.insight) {
											// Clean up any HTML tags
											const cleanedInsight = parsed.insight
												.replace(/<cite[^>]*>/g, '')
												.replace(/<\/cite>/g, '')
												.trim();

											insightText = cleanedInsight;
											recommendedTopics = parsed.recommended_topics || [];

											// Send structured insight
											const structuredData = {
												type: 'structured_insight',
												insight: cleanedInsight,
												recommendedTopics
											};
											controller.enqueue(
												encoder.encode(`data: ${JSON.stringify(structuredData)}\n\n`)
											);
											capturedEvents.push(structuredData);
										}
									} catch (e) {
										// Not valid JSON yet, keep accumulating
									}
								} else {
									// This is the search query being formed
									searchQuery += event.delta.partial_json;
									const queryData = { type: 'search_query', query: event.delta.partial_json };
									controller.enqueue(
										encoder.encode(`data: ${JSON.stringify(queryData)}\n\n`)
									);
									capturedEvents.push(queryData);
								}
							}
						}
					}

					// Extract citations/sources from search results
					if (searchResults && searchResults.length > 0) {
						sources = searchResults.slice(0, 5).map((result: any) => ({
							url: result.url || '',
							title: result.title || new URL(result.url).hostname
						})).filter((s: any) => s.url);
					}

					console.log('');
					console.log('✅ ============================================');
					console.log('✅ API CALL COMPLETE');
					console.log('✅ Search results:', searchResults.length);
					console.log('✅ Final insight:', insightText.substring(0, 80) + '...');
					console.log('✅ Recommended topics:', recommendedTopics.length);
					console.log('✅ Sources:', sources.length);
					console.log('✅ ============================================');
					console.log('');

					// Send complete event with all data
					const doneData = {
						type: 'done',
						topic,
						insight: insightText,
						recommendedTopics,
						sources
					};
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`)
					);
					capturedEvents.push(doneData);

					// Save to KV cache
					if (kv) {
						try {
							await kv.put(cacheKey, JSON.stringify({
								timestamp: Date.now(),
								topic,
								insight: insightText,
								recommendedTopics,
								sources,
								events: capturedEvents
							}), {
								expirationTtl: 86400 // 24 hours
							});
							console.log('💾 Saved to KV cache:', cacheKey, `(${capturedEvents.length} events, TTL: 24h)`);
						} catch (e) {
							console.error('❌ KV cache write error:', e);
							// Don't fail the request on cache write error
						}
					}

					controller.close();
				} catch (error) {
					console.error('Error generating insight:', error);
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`)
					);
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
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
