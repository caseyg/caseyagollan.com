import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';

// Text editor tool implementation
function handleTextEditorTool(toolInput: any, document: string): { result: string; newDocument?: string } {
	const { command, old_str, new_str, file_text, insert_line, view_range } = toolInput;

	if (command === 'view') {
		const lines = document.split('\n');
		const start = view_range ? view_range[0] - 1 : 0;
		const end = view_range ? (view_range[1] === -1 ? lines.length : view_range[1]) : lines.length;
		const viewLines = lines.slice(start, end);
		const result = viewLines.map((line, i) => `${start + i + 1}: ${line}`).join('\n');
		return { result };
	}

	if (command === 'str_replace') {
		const regex = new RegExp(old_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
		const matches = document.match(regex);
		const count = matches ? matches.length : 0;

		if (count === 0) {
			return { result: 'Error: No match found for replacement' };
		} else if (count > 1) {
			return { result: `Error: Found ${count} matches. Please provide more context for unique match.` };
		} else {
			const newDocument = document.replace(old_str, new_str);
			return { result: 'Successfully replaced text at exactly one location.', newDocument };
		}
	}

	if (command === 'create') {
		return { result: `File created successfully with ${file_text.split('\n').length} lines.`, newDocument: file_text };
	}

	if (command === 'insert') {
		const lines = document.split('\n');
		lines.splice(insert_line, 0, new_str);
		const newDocument = lines.join('\n');
		return { result: `Successfully inserted text at line ${insert_line}.`, newDocument };
	}

	return { result: 'Unknown command' };
}

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
			const cached = await kvCache.get(cacheKey);
			if (cached) {
				// Return cached bio as a simple response (not streaming)
				return json({
					document: cached,
					fromCache: true
				});
			}
		}

		// Get API key from platform.env (Cloudflare Workers)
		const ANTHROPIC_API_KEY = platform?.env?.ANTHROPIC_API_KEY;

		if (!ANTHROPIC_API_KEY) {
			return json({ error: 'Claude API key not configured' }, { status: 500 });
		}

		const anthropic = new Anthropic({
			apiKey: ANTHROPIC_API_KEY
		});

		let document = currentDocument || 'Casey leads research operations at IBM, building AI productivity tools and serving on the ResearchOps Community board.\n\nPreviously, they co-founded the School for Poetic Computation and led operations at NYU AI Now Institute.\n';

		const messages: any[] = [
			{
				role: 'user',
				content: `I just learned this about Casey Gollan's work with "${topic}": "${insight}"

Please update the profile to incorporate this new information using TARGETED edits. Requirements:

1. MAXIMUM 150 words total - HARD LIMIT, must cut text if needed to stay under
2. Plain text only - NO markdown, NO headings, NO bullets, NO lists, NO formatting
3. 2 paragraphs maximum
4. Write as a cohesive narrative
5. PRIORITIZE BREVITY - use concise language, eliminate redundancy

CRITICAL Instructions for targeted editing:
1. View the current document first
2. Check the word count - if over 120 words, CONDENSE before adding new info
3. Identify ONLY the specific sentence(s) or phrase(s) that need to change
4. When replacing text, make it MORE CONCISE than the original
5. Remove less important details to make room for new information
6. Use str_replace to replace ONLY those specific parts - not the entire document
7. Keep unchanged text exactly as-is

Example approach:
- If adding info about tools AND the bio is getting long, SHORTEN the existing tools sentence while adding the new detail
- Replace verbose phrases with concise equivalents
- Eliminate redundant information
- Focus on the most important, distinctive details only

The output should read like a professional bio - clear, concise prose only. Think "elevator pitch" not "resume".`
			}
		];

		const tools: any[] = [
			{
				type: 'text_editor_20250728',
				name: 'str_replace_based_edit_tool'
			}
		];

		// Create streaming response
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				try {
					let continueLoop = true;
					let iterationCount = 0;
					const maxIterations = 10;

					while (continueLoop && iterationCount < maxIterations) {
						iterationCount++;

						const response = await anthropic.messages.create({
							model: 'claude-haiku-4-5-20251001',
							max_tokens: 2000,
							messages,
							tools
						});

						// Add assistant's response to messages
						messages.push({
							role: 'assistant',
							content: response.content
						});

						// Check if we should continue (tool use present)
						const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');

						if (toolUseBlocks.length === 0) {
							// No more tool use, we're done
							continueLoop = false;
						} else {
							// Process tool uses
							const toolResults: any[] = [];

							for (const toolUse of toolUseBlocks) {
								if (toolUse.type === 'tool_use') {
									const input = toolUse.input;

									// Stream the edit operation details
									controller.enqueue(
										encoder.encode(
											`data: ${JSON.stringify({
												type: 'edit',
												command: input.command,
												old_text: input.old_str,
												new_text: input.new_str
											})}\n\n`
										)
									);

									const result = handleTextEditorTool(input, document);

									if (result.newDocument) {
										document = result.newDocument;

										// Stream the updated document
										controller.enqueue(
											encoder.encode(
												`data: ${JSON.stringify({
													type: 'document_update',
													document
												})}\n\n`
											)
										);
									}

									toolResults.push({
										type: 'tool_result',
										tool_use_id: toolUse.id,
										content: result.result
									});
								}
							}

							// Add tool results to messages
							messages.push({
								role: 'user',
								content: toolResults
							});
						}
					}

					// Cache the final document in KV
					if (kvCache) {
						await kvCache.put(cacheKey, document, {
							expirationTtl: 60 * 60 * 24 * 30 // 30 days
						});
					}

					// Send final completion
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								type: 'done',
								document,
								iterations: iterationCount
							})}\n\n`
						)
					);

					controller.close();
				} catch (error) {
					console.error('Error updating document:', error);
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								type: 'error',
								error: String(error)
							})}\n\n`
						)
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
		console.error('Error updating document:', error);
		return json({ error: 'Failed to update document' }, { status: 500 });
	}
};
