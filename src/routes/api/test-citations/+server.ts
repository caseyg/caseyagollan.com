import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const { topic } = await request.json();

		const ANTHROPIC_API_KEY = platform?.env?.ANTHROPIC_API_KEY;

		if (!ANTHROPIC_API_KEY) {
			return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const anthropic = new Anthropic({
			apiKey: ANTHROPIC_API_KEY
		});

		const context = `Casey Gollan leads research operations, design management, and engineering management at IBM for AI productivity tools.`;

		console.log('🧪 Testing STREAMING citations for topic:', topic);

		// Create a streaming response
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				let citationsCount = 0;

				try {
					const apiStream = await anthropic.messages.create({
						model: 'claude-haiku-4-5-20251001',
						max_tokens: 500,
						temperature: 1,
						messages: [
							{
								role: 'user',
								content: `Search the web for: ${topic}. Provide a brief insight with citations.`
							}
						],
						tools: [
							{
								type: 'web_search_20250305',
								name: 'web_search'
							}
						],
						stream: true
					});

					for await (const event of apiStream) {
						// Log event types
						console.log('📦 Event type:', event.type);

						// Check text_delta events for citations
						if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
							console.log('🔍 text_delta keys:', Object.keys(event.delta));

							// Check if citations exist
							if ((event.delta as any).citations) {
								const citations = (event.delta as any).citations;
								citationsCount += citations.length;
								console.log('📎 Found citations in text_delta:', citations.length);
								citations.forEach((c: any, i: number) => {
									console.log(`  ${i + 1}. ${c.title}`);
									console.log(`     cited_text: ${c.cited_text?.substring(0, 100)}...`);
								});
							}
						}

						// Forward event to client
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify({ type: 'event', event })}\n\n`)
						);
					}

					console.log('✅ Stream complete. Total citations found:', citationsCount);

					// Send final summary
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ type: 'done', citations_count: citationsCount })}\n\n`)
					);

					controller.close();
				} catch (error) {
					console.error('Error:', error);
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
				'Connection': 'keep-alive'
			}
		});
	} catch (error) {
		console.error('Error:', error);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
