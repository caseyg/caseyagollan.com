import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

// GET /api/kv - List all keys or get a specific key's value
export const GET: RequestHandler = async ({ url, platform }) => {
	const kv = platform?.env?.INSIGHT_CACHE;

	if (!kv) {
		throw error(500, 'KV namespace not available');
	}

	const key = url.searchParams.get('key');

	// If key is specified, get its value
	if (key) {
		try {
			const value = await kv.get(key, { type: 'text' });

			if (value === null) {
				throw error(404, `Key "${key}" not found`);
			}

			// Try to parse as JSON, otherwise return as text
			let parsedValue;
			try {
				parsedValue = JSON.parse(value);
			} catch {
				parsedValue = value;
			}

			// Get metadata
			const metadata = await kv.getWithMetadata(key);

			return json({
				key,
				value: parsedValue,
				metadata: metadata.metadata,
				size: value.length
			});
		} catch (e: any) {
			if (e.status) throw e;
			throw error(500, `Failed to get key: ${e.message}`);
		}
	}

	// Otherwise, list all keys
	try {
		const prefix = url.searchParams.get('prefix') || undefined;
		const limit = parseInt(url.searchParams.get('limit') || '1000');
		const cursor = url.searchParams.get('cursor') || undefined;

		const result = await kv.list({ prefix, limit, cursor });

		return json({
			keys: result.keys.map(k => ({
				name: k.name,
				expiration: k.expiration,
				metadata: k.metadata
			})),
			list_complete: result.list_complete,
			cursor: result.cursor
		});
	} catch (e: any) {
		throw error(500, `Failed to list keys: ${e.message}`);
	}
};

// POST /api/kv - Set a key-value pair
export const POST: RequestHandler = async ({ request, platform }) => {
	const kv = platform?.env?.INSIGHT_CACHE;

	if (!kv) {
		throw error(500, 'KV namespace not available');
	}

	try {
		const { key, value, expirationTtl, metadata } = await request.json();

		if (!key) {
			throw error(400, 'Key is required');
		}

		if (value === undefined) {
			throw error(400, 'Value is required');
		}

		// Convert value to string if it's an object
		const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

		// Prepare put options
		const options: any = {};
		if (expirationTtl) options.expirationTtl = parseInt(expirationTtl);
		if (metadata) options.metadata = metadata;

		await kv.put(key, stringValue, options);

		return json({
			success: true,
			key,
			message: 'Key saved successfully'
		});
	} catch (e: any) {
		if (e.status) throw e;
		throw error(500, `Failed to save key: ${e.message}`);
	}
};

// DELETE /api/kv - Delete a key
export const DELETE: RequestHandler = async ({ url, platform }) => {
	const kv = platform?.env?.INSIGHT_CACHE;

	if (!kv) {
		throw error(500, 'KV namespace not available');
	}

	const key = url.searchParams.get('key');

	if (!key) {
		throw error(400, 'Key is required');
	}

	try {
		await kv.delete(key);

		return json({
			success: true,
			key,
			message: 'Key deleted successfully'
		});
	} catch (e: any) {
		throw error(500, `Failed to delete key: ${e.message}`);
	}
};
