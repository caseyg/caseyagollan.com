<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	interface KVKey {
		name: string;
		expiration?: number;
		metadata?: any;
	}

	interface KVValue {
		key: string;
		value: any;
		metadata?: any;
		size: number;
	}

	let keys: KVKey[] = [];
	let selectedKey: string | null = null;
	let selectedValue: KVValue | null = null;
	let editedValue: string = '';
	let isEditing = false;
	let loading = false;
	let error: string | null = null;
	let success: string | null = null;
	let showNewKeyModal = false;
	let newKeyName = '';
	let newKeyValue = '';
	let newKeyTTL = '';
	let searchQuery = '';

	// Load keys on mount
	onMount(() => {
		if (browser) {
			loadKeys();
		}
	});

	async function loadKeys() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/kv');
			if (!response.ok) {
				throw new Error(await response.text());
			}

			const data = await response.json();
			keys = data.keys;
		} catch (e: any) {
			error = `Failed to load keys: ${e.message}`;
		} finally {
			loading = false;
		}
	}

	async function loadValue(key: string) {
		loading = true;
		error = null;
		selectedKey = key;

		try {
			const response = await fetch(`/api/kv?key=${encodeURIComponent(key)}`);
			if (!response.ok) {
				throw new Error(await response.text());
			}

			selectedValue = await response.json();
			editedValue = typeof selectedValue.value === 'string'
				? selectedValue.value
				: JSON.stringify(selectedValue.value, null, 2);
			isEditing = false;
		} catch (e: any) {
			error = `Failed to load value: ${e.message}`;
		} finally {
			loading = false;
		}
	}

	async function saveValue() {
		if (!selectedKey) return;

		loading = true;
		error = null;
		success = null;

		try {
			// Try to parse as JSON, otherwise save as string
			let value: any;
			try {
				value = JSON.parse(editedValue);
			} catch {
				value = editedValue;
			}

			const response = await fetch('/api/kv', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: selectedKey, value })
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			success = 'Value saved successfully';
			isEditing = false;
			await loadValue(selectedKey);
		} catch (e: any) {
			error = `Failed to save value: ${e.message}`;
		} finally {
			loading = false;
		}
	}

	async function deleteKey(key: string) {
		if (!confirm(`Are you sure you want to delete "${key}"?`)) {
			return;
		}

		loading = true;
		error = null;
		success = null;

		try {
			const response = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			success = `Key "${key}" deleted successfully`;
			if (selectedKey === key) {
				selectedKey = null;
				selectedValue = null;
			}
			await loadKeys();
		} catch (e: any) {
			error = `Failed to delete key: ${e.message}`;
		} finally {
			loading = false;
		}
	}

	async function deleteAllKeys() {
		const count = keys.length;
		if (!confirm(`Are you sure you want to delete ALL ${count} keys? This cannot be undone.`)) {
			return;
		}

		loading = true;
		error = null;
		success = null;

		try {
			// Delete all keys in parallel
			const deletePromises = keys.map(key =>
				fetch(`/api/kv?key=${encodeURIComponent(key.name)}`, {
					method: 'DELETE'
				})
			);

			await Promise.all(deletePromises);

			success = `Successfully deleted ${count} keys`;
			selectedKey = null;
			selectedValue = null;
			await loadKeys();
		} catch (e: any) {
			error = `Failed to delete all keys: ${e.message}`;
		} finally {
			loading = false;
		}
	}

	async function createNewKey() {
		if (!newKeyName) {
			error = 'Key name is required';
			return;
		}

		loading = true;
		error = null;
		success = null;

		try {
			let value: any;
			try {
				value = JSON.parse(newKeyValue);
			} catch {
				value = newKeyValue;
			}

			const body: any = { key: newKeyName, value };
			if (newKeyTTL) {
				body.expirationTtl = parseInt(newKeyTTL);
			}

			const response = await fetch('/api/kv', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			success = `Key "${newKeyName}" created successfully`;
			showNewKeyModal = false;
			newKeyName = '';
			newKeyValue = '';
			newKeyTTL = '';
			await loadKeys();
		} catch (e: any) {
			error = `Failed to create key: ${e.message}`;
		} finally {
			loading = false;
		}
	}

	function formatDate(timestamp?: number) {
		if (!timestamp) return 'Never';
		return new Date(timestamp * 1000).toLocaleString();
	}

	function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}

	$: filteredKeys = keys.filter(k => k.name.toLowerCase().includes(searchQuery.toLowerCase()));
</script>

<svelte:head>
	<title>KV Editor - Casey Gollan</title>
</svelte:head>

<div class="editor-container">
	<header>
		<h1>Cloudflare KV Editor</h1>
		<p>INSIGHT_CACHE namespace</p>
	</header>

	{#if error}
		<div class="message error">
			{error}
			<button on:click={() => error = null}>×</button>
		</div>
	{/if}

	{#if success}
		<div class="message success">
			{success}
			<button on:click={() => success = null}>×</button>
		</div>
	{/if}

	<div class="editor-layout">
		<!-- Left panel: Keys list -->
		<aside class="keys-panel">
			<div class="panel-header">
				<input
					type="text"
					placeholder="Search keys..."
					bind:value={searchQuery}
					class="search-input"
				/>
				<button on:click={() => showNewKeyModal = true} class="btn-primary">
					+ New Key
				</button>
				<button on:click={loadKeys} class="btn-secondary" disabled={loading}>
					{loading ? 'Refreshing...' : 'Refresh'}
				</button>
				{#if keys.length > 0}
					<button on:click={deleteAllKeys} class="btn-danger" disabled={loading}>
						Delete All ({keys.length})
					</button>
				{/if}
			</div>

			<div class="keys-list">
				{#if loading && keys.length === 0}
					<div class="loading">Loading keys...</div>
				{:else if filteredKeys.length === 0}
					<div class="empty">No keys found</div>
				{:else}
					{#each filteredKeys as key}
						<div
							class="key-item"
							class:selected={selectedKey === key.name}
							role="button"
							tabindex="0"
							on:click={() => loadValue(key.name)}
							on:keydown={(e) => e.key === 'Enter' && loadValue(key.name)}
						>
							<div class="key-name">{key.name}</div>
							{#if key.expiration}
								<div class="key-meta">Expires: {formatDate(key.expiration)}</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<div class="panel-footer">
				{filteredKeys.length} {filteredKeys.length === 1 ? 'key' : 'keys'}
			</div>
		</aside>

		<!-- Right panel: Value editor -->
		<main class="value-panel">
			{#if selectedValue}
				<div class="panel-header">
					<h2>{selectedValue.key}</h2>
					<div class="actions">
						{#if isEditing}
							<button on:click={saveValue} class="btn-primary" disabled={loading}>
								Save
							</button>
							<button on:click={() => {
								isEditing = false;
								editedValue = typeof selectedValue.value === 'string'
									? selectedValue.value
									: JSON.stringify(selectedValue.value, null, 2);
							}} class="btn-secondary">
								Cancel
							</button>
						{:else}
							<button on:click={() => isEditing = true} class="btn-primary">
								Edit
							</button>
							<button on:click={() => deleteKey(selectedValue.key)} class="btn-danger">
								Delete
							</button>
						{/if}
					</div>
				</div>

				<div class="value-meta">
					<span>Size: {formatSize(selectedValue.size)}</span>
					{#if selectedValue.metadata}
						<span>Metadata: {JSON.stringify(selectedValue.metadata)}</span>
					{/if}
				</div>

				<div class="value-editor">
					{#if isEditing}
						<textarea
							bind:value={editedValue}
							class="code-editor"
							placeholder="Enter value (JSON or text)..."
							spellcheck="false"
						></textarea>
					{:else}
						<pre class="code-display">{editedValue}</pre>
					{/if}
				</div>
			{:else}
				<div class="empty-state">
					<p>Select a key to view its value</p>
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- New Key Modal -->
{#if showNewKeyModal}
	<div class="modal-overlay" role="presentation" on:click={() => showNewKeyModal = false} on:keydown={(e) => e.key === 'Escape' && (showNewKeyModal = false)}>
		<div class="modal" role="dialog" aria-labelledby="modal-title" on:click|stopPropagation on:keydown|stopPropagation>
			<h2 id="modal-title">Create New Key</h2>

			<label>
				Key Name
				<input
					type="text"
					bind:value={newKeyName}
					placeholder="my-key"
					required
				/>
			</label>

			<label>
				Value (JSON or text)
				<textarea
					bind:value={newKeyValue}
					placeholder="{`{\"example\": \"value\"}`}"
					rows="8"
					class="code-editor"
					spellcheck="false"
				></textarea>
			</label>

			<label>
				Expiration TTL (seconds, optional)
				<input
					type="number"
					bind:value={newKeyTTL}
					placeholder="86400 (24 hours)"
				/>
			</label>

			<div class="modal-actions">
				<button on:click={createNewKey} class="btn-primary" disabled={loading}>
					Create
				</button>
				<button on:click={() => showNewKeyModal = false} class="btn-secondary">
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.editor-container {
		min-height: 100vh;
		background: #0a0a0a;
		color: #e0e0e0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	}

	header {
		padding: 2rem;
		border-bottom: 1px solid #333;
	}

	header h1 {
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
		color: #fff;
	}

	header p {
		margin: 0;
		color: #888;
		font-size: 0.9rem;
	}

	.message {
		margin: 1rem 2rem;
		padding: 1rem;
		border-radius: 4px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.message.error {
		background: #3d1a1a;
		border: 1px solid #661a1a;
		color: #ff9999;
	}

	.message.success {
		background: #1a3d1a;
		border: 1px solid #1a661a;
		color: #99ff99;
	}

	.message button {
		background: none;
		border: none;
		color: inherit;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0 0.5rem;
		opacity: 0.7;
	}

	.message button:hover {
		opacity: 1;
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 300px 1fr;
		height: calc(100vh - 150px);
	}

	.keys-panel {
		border-right: 1px solid #333;
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		padding: 1rem;
		border-bottom: 1px solid #333;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.search-input {
		width: 100%;
		padding: 0.5rem;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #e0e0e0;
		font-size: 0.9rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #555;
	}

	.keys-list {
		flex: 1;
		overflow-y: auto;
	}

	.key-item {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #222;
		cursor: pointer;
		transition: background 0.15s;
	}

	.key-item:hover {
		background: #1a1a1a;
	}

	.key-item.selected {
		background: #2a2a2a;
		border-left: 3px solid #4a9eff;
	}

	.key-name {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.85rem;
		color: #4a9eff;
		word-break: break-all;
	}

	.key-meta {
		font-size: 0.75rem;
		color: #888;
		margin-top: 0.25rem;
	}

	.panel-footer {
		padding: 0.75rem 1rem;
		border-top: 1px solid #333;
		font-size: 0.85rem;
		color: #888;
	}

	.value-panel {
		display: flex;
		flex-direction: column;
	}

	.value-panel .panel-header {
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
	}

	.value-panel h2 {
		margin: 0;
		font-size: 1.1rem;
		font-family: 'Monaco', 'Courier New', monospace;
		color: #4a9eff;
		word-break: break-all;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.value-meta {
		padding: 0.75rem 1rem;
		background: #151515;
		border-bottom: 1px solid #333;
		font-size: 0.85rem;
		color: #888;
		display: flex;
		gap: 1rem;
	}

	.value-editor {
		flex: 1;
		overflow: auto;
		padding: 1rem;
	}

	.code-editor,
	.code-display {
		width: 100%;
		height: 100%;
		min-height: 400px;
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 4px;
		padding: 1rem;
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.9rem;
		color: #e0e0e0;
		line-height: 1.5;
		resize: vertical;
	}

	.code-editor:focus {
		outline: none;
		border-color: #555;
	}

	.code-display {
		margin: 0;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #666;
		font-size: 1.1rem;
	}

	.loading,
	.empty {
		padding: 2rem;
		text-align: center;
		color: #666;
	}

	button {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.15s;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #4a9eff;
		color: #fff;
	}

	.btn-primary:hover:not(:disabled) {
		background: #5aaeff;
	}

	.btn-secondary {
		background: #333;
		color: #e0e0e0;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #444;
	}

	.btn-danger {
		background: #661a1a;
		color: #ff9999;
	}

	.btn-danger:hover:not(:disabled) {
		background: #771a1a;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 2rem;
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal h2 {
		margin: 0 0 1.5rem 0;
		color: #fff;
	}

	.modal label {
		display: block;
		margin-bottom: 1.5rem;
		color: #e0e0e0;
		font-size: 0.9rem;
	}

	.modal input,
	.modal textarea {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #e0e0e0;
		font-family: inherit;
		font-size: 0.9rem;
	}

	.modal textarea {
		font-family: 'Monaco', 'Courier New', monospace;
	}

	.modal input:focus,
	.modal textarea:focus {
		outline: none;
		border-color: #555;
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
</style>
