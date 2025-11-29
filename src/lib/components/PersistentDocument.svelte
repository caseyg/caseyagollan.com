<script lang="ts">
	import { onMount } from 'svelte';

	let {
		content = 'Casey leads research operations at IBM, building AI productivity tools and serving on the ResearchOps Community board.\n\nPreviously, they co-founded the School for Poetic Computation and led operations at NYU AI Now Institute.',
		isUpdating = false,
		editEvent = undefined,
		onAnimationStateChange = undefined
	}: {
		content?: string;
		isUpdating?: boolean;
		editEvent?: { old_text: string; new_text: string } | undefined;
		onAnimationStateChange?: (isAnimating: boolean) => void;
	} = $props();

	let displayContent = $state(content);
	let isAnimating = $state(false);
	let highlightedSection = $state('');
	let highlightStart = $state(-1);
	let highlightEnd = $state(-1);

	// Edit queue for handling multiple rapid edit events
	let editQueue: Array<{ old_text: string; new_text: string }> = [];
	let isProcessingQueue = false;

	// Track last processed edit to prevent infinite loops
	let lastProcessedEdit: typeof editEvent | undefined = undefined;

	// Handle edit events with animation
	$effect(() => {
		if (editEvent && editEvent.old_text && editEvent.new_text && editEvent !== lastProcessedEdit) {
			lastProcessedEdit = editEvent;

			// Add to queue
			editQueue.push({
				old_text: editEvent.old_text,
				new_text: editEvent.new_text
			});

			// Start processing queue if not already processing
			if (!isProcessingQueue) {
				processEditQueue();
			}
		}
	});

	async function processEditQueue() {
		if (isProcessingQueue || editQueue.length === 0) {
			return;
		}

		isProcessingQueue = true;

		while (editQueue.length > 0) {
			const edit = editQueue.shift()!;

			// Wait for animation to complete
			await animateDiff(edit.old_text, edit.new_text);

			// Small delay between animations
			if (editQueue.length > 0) {
				await sleep(200);
			}
		}

		isProcessingQueue = false;
	}

	// Find word-level differences between two texts
	function findDiffs(oldText: string, newText: string): Array<{oldText: string, newText: string}> {
		const oldWords = oldText.split(/\s+/);
		const newWords = newText.split(/\s+/);

		// Find common prefix
		let prefixEnd = 0;
		while (prefixEnd < oldWords.length && prefixEnd < newWords.length && oldWords[prefixEnd] === newWords[prefixEnd]) {
			prefixEnd++;
		}

		// Find common suffix
		let suffixStart = 0;
		while (
			suffixStart < (oldWords.length - prefixEnd) &&
			suffixStart < (newWords.length - prefixEnd) &&
			oldWords[oldWords.length - 1 - suffixStart] === newWords[newWords.length - 1 - suffixStart]
		) {
			suffixStart++;
		}

		// Extract the differing middle section
		const oldMiddle = oldWords.slice(prefixEnd, oldWords.length - suffixStart);
		const newMiddle = newWords.slice(prefixEnd, newWords.length - suffixStart);

		if (oldMiddle.length === 0 && newMiddle.length === 0) {
			return []; // No changes
		}

		// Return as a single diff of the middle section
		return [{
			oldText: oldMiddle.join(' '),
			newText: newMiddle.join(' ')
		}];
	}

	async function animateMultipleDiffs(diffs: Array<{oldText: string, newText: string}>) {
		for (const diff of diffs) {
			await animateDiff(diff.oldText, diff.newText);
			await sleep(100); // Brief pause between diffs
		}
	}

	async function animateDiff(oldText: string, newText: string) {
		if (!oldText) {
			return;
		}

		isAnimating = true;
		onAnimationStateChange?.(true);

		// Find the position of old_text in current displayContent
		const startPos = displayContent.indexOf(oldText);
		if (startPos === -1) {
			isAnimating = false;
			onAnimationStateChange?.(false);
			return;
		}

		const endPos = startPos + oldText.length;

		// Store the unchanging parts
		const before = displayContent.substring(0, startPos);
		const after = displayContent.substring(endPos);

		// Split by whitespace but keep words+trailing space together
		// This prevents awkward character-by-character deletions
		const oldWords = oldText.match(/\S+\s*/g) || [];
		const newWords = newText.match(/\S+\s*/g) || [];

		// Highlight the section to be replaced
		highlightStart = startPos;
		highlightEnd = endPos;
		await sleep(150);

		// Remove old words one by one (backwards)
		for (let i = oldWords.length; i >= 0; i--) {
			const remainingOld = oldWords.slice(0, i).join('');
			displayContent = before + remainingOld + after;
			highlightEnd = startPos + remainingOld.length;
			await sleep(25);
		}

		// Add new words one by one
		for (let i = 0; i <= newWords.length; i++) {
			const growingNew = newWords.slice(0, i).join('');
			displayContent = before + growingNew + after;
			highlightEnd = startPos + growingNew.length;
			await sleep(30);
		}

		await sleep(100);

		// Clear highlight
		highlightStart = -1;
		highlightEnd = -1;
		isAnimating = false;
		onAnimationStateChange?.(false);
	}

	function sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
</script>

<div class="bio" class:updating={isUpdating}>
	<div class="header-label">
		{#if isUpdating}
			<span class="pulse"></span>
			Rewriting...
		{:else}
			About Casey
		{/if}
	</div>
	<div class="content">
		{#if highlightStart >= 0 && highlightEnd >= 0}
			<span>{displayContent.substring(0, highlightStart)}</span><span class="highlight">{displayContent.substring(highlightStart, highlightEnd)}</span><span>{displayContent.substring(highlightEnd)}</span>
		{:else}
			{displayContent}
		{/if}
	</div>
</div>

<style>
	.bio {
		overflow-y: auto;
		border-radius: 4px;
		transition: all 0.3s ease;
	}

	.header-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		margin-bottom: 1rem;
		color: rgba(255, 255, 255, 0.6);
		transition: color 0.3s ease;
	}

	.bio.updating .header-label {
		color: rgb(180, 180, 255);
	}

	.pulse {
		width: 6px;
		height: 6px;
		background: rgb(150, 150, 255);
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.2);
		}
	}

	.content {
		color: rgba(255, 255, 255, 0.9);
		line-height: 1.6;
		font-size: 0.95rem;
		white-space: pre-wrap;
	}

	.content .highlight {
		background: rgba(73, 73, 255, 0.4);
		color: rgb(255, 255, 255);
		border-radius: 2px;
		padding: 0 2px;
		transition: background 0.15s ease;
	}

	@media (max-width: 1200px) {
		.bio {
			position: relative;
			top: 0;
			margin-top: 2rem;
		}
	}

	@media (max-width: 768px) {
		.bio {
			max-height: 250px;
			margin-top: 1rem;
		}

		.content {
			font-size: 0.875rem;
		}

		.header-label {
			font-size: 0.7rem;
			margin-bottom: 0.75rem;
		}
	}
</style>
