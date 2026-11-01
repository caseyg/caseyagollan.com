import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const { topic, insight, currentDocument, clickedTopics } = await request.json();

		if (!topic || !insight) {
			return json({ error: 'Topic and insight are required' }, { status: 400 });
		}

		// Generate cache key from sorted topic list
		const topicList = clickedTopics || [topic];
		const cacheKey = `bio:${topicList.sort().join(',')}`;

		// Try to get cached bio from KV
		const kvCache = platform?.env?.INSIGHT_CACHE;
		if (kvCache) {
			try {
				const cached = await kvCache.get(cacheKey);
				if (cached) {
				// Stream the cached bio to trigger diff animation
				const stream = new ReadableStream({
					async start(controller) {
						const encoder = new TextEncoder();
						let controllerClosed = false;

						const safeEnqueue = (data: string) => {
							if (controllerClosed) return;
							try {
								controller.enqueue(encoder.encode(data));
							} catch {
								controllerClosed = true;
							}
						};

						const safeClose = () => {
							if (controllerClosed) return;
							try {
								controller.close();
								controllerClosed = true;
							} catch {
								controllerClosed = true;
							}
						};

						// Calculate what changed from current to cached
						const oldDoc = currentDocument || '';
						const newDoc = cached;

						// Send edit event to trigger animation
						safeEnqueue(
							`data: ${JSON.stringify({
								type: 'edit',
								command: 'str_replace',
								old_text: oldDoc,
								new_text: newDoc
							})}\n\n`
						);

						// Small delay to ensure UI updates
						await new Promise(resolve => setTimeout(resolve, 100));

						// Send done event with final document
						safeEnqueue(
							`data: ${JSON.stringify({
								type: 'done',
								document: newDoc
							})}\n\n`
						);

						safeClose();
					}
				});

				return new Response(stream, {
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						Connection: 'keep-alive',
						'X-Cache-Status': 'HIT'
					}
				});
				}
			} catch (kvError) {
				console.error('KV cache error (ignoring):', kvError);
				// Continue to generate fresh bio if cache fails
			}
		}

		// Get API key from platform.env (Cloudflare Workers)
		const INFERENCE_COOP_API_KEY = platform?.env?.INFERENCE_COOP_API_KEY;

		if (!INFERENCE_COOP_API_KEY) {
			return json({ error: 'AI inference API key not configured' }, { status: 500 });
		}

		const document = currentDocument || 'Casey leads research operations at IBM, building AI productivity tools and serving on the ResearchOps Community board.\n\nPreviously, they co-founded the School for Poetic Computation and led operations at NYU AI Now Institute.\n';

		const openai = new OpenAI({
			apiKey: INFERENCE_COOP_API_KEY,
			baseURL: 'https://gateway.inference.coop/v1'
		});

		// Create streaming response
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				let controllerClosed = false;

				const safeEnqueue = (data: string) => {
					if (controllerClosed) return false;
					try {
						controller.enqueue(encoder.encode(data));
						return true;
					} catch {
						controllerClosed = true;
						return false;
					}
				};

				const safeClose = () => {
					if (controllerClosed) return;
					try {
						controller.close();
						controllerClosed = true;
					} catch {
						controllerClosed = true;
					}
				};

				try {
					const completion = await openai.chat.completions.create({
						model: 'greenpt/glm-5.3-flash',
						max_tokens: 2000,
						messages: [
							{
								role: 'system',
								content: `You are a concise biography editor. You update profile documents by incorporating new information while keeping the text tight and focused.

RULES:
1. MAXIMUM 150 words total - HARD LIMIT
2. Plain text only - NO markdown, NO headings, NO bullets, NO lists, NO formatting
3. 2 paragraphs maximum
4. Write as a cohesive narrative
5. PRIORITIZE BREVITY - use concise language, eliminate redundancy
6. Output ONLY the updated document text - nothing else (no quotes, no explanations, no preamble)`
							},
							{
								role: 'user',
								content: `Current document:\n---\n${document}\n---\n\nNew information to incorporate about "${topic}":\n${insight}\n\nPlease produce the updated document. Keep it under 150 words, plain text only, 2 paragraphs max. Replace the entire document with the updated version.`
							}
						]
					});

					const newDocument = completion.choices[0]?.message?.content?.trim() || document;

					// Send edit event to trigger animation
					safeEnqueue(
						`data: ${JSON.stringify({
							type: 'edit',
							command: 'str_replace',
							old_text: document,
							new_text: newDocument
						})}\n\n`
					);

					// Small delay to ensure UI updates
					await new Promise(resolve => setTimeout(resolve, 100));

					// Cache the final document in KV
					if (kvCache) {
						try {
							await kvCache.put(cacheKey, newDocument, {
								expirationTtl: 60 * 60 * 24 * 30 // 30 days
							});
						} catch (kvError) {
							console.error('KV cache write error (ignoring):', kvError);
						}
					}

					// Send final completion
					safeEnqueue(
						`data: ${JSON.stringify({
							type: 'done',
							document: newDocument
						})}\n\n`
					);

					safeClose();
				} catch (error) {
					console.error('Error updating document:', error);
					safeEnqueue(
						`data: ${JSON.stringify({
							type: 'error',
							error: String(error)
						})}\n\n`
					);
					safeClose();
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
		console.error('Error updating document:', error);
		return json({ error: 'Failed to update document' }, { status: 500 });
	}
};
