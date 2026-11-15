<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { InsightResponse } from '$lib/insight-types';
	import { browser } from '$app/environment';
	import { select } from 'd3-selection';
	import { drag } from 'd3-drag';
	import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
	import { easeCubicOut, easeQuadOut } from 'd3-ease';
	import 'd3-transition';
	import { allNodes, allLinks, type Node, type Link } from '$lib/data/graph-data';
	import { urlKey } from '$lib/graph-curation';
	import { usePageCommands } from '$lib/page-commands.svelte';
	import { goto } from '$app/navigation';
	import { wikiHref } from '$lib/wiki/links';
	import LinkPreviewCard, { faviconUrl, type LinkPreviewImage } from '$lib/components/ui/LinkPreviewCard.svelte';
	import { cue } from '$lib/sound.svelte';

	let {
		onTopicClick,
		focusNodeId = $bindable(),
		insightsData,
		loadingTopics = [],
		onNodeContextMenu
	}: {
		onTopicClick?: (topic: string | null) => void;
		/** Given only to the owner: a right-click on a node opens their menu instead of the browser's. */
		onNodeContextMenu?: (node: Node, event: MouseEvent) => void;
		focusNodeId?: string | null;
		insightsData?: Map<string, InsightResponse>;
		loadingTopics?: string[];
	} = $props();

	let graphContainer: HTMLDivElement;
	let focusedNode: string | null = $state(null);

	// Focusing a node further from Casey rises; coming back toward the center falls.
	const DEPTH: Partial<Record<Node['type'], number>> = { center: 0, category: 1, subcategory: 2, node: 3 };
	function cueFocus(next: Pick<Node, 'id' | 'type'>) {
		const from = focusedNode ? allNodes.find((node) => node.id === focusedNode) ?? shownNodes.find((node) => node.id === focusedNode) : undefined;
		const deeper = (DEPTH[next.type] ?? 3) >= (from ? DEPTH[from.type] ?? 3 : 0);
		cue('select', { direction: deeper ? 'forward' : 'back' });
	}

	// The nodes on screen are also commands in the site's command palette.
	let shownNodes = $state<Pick<Node, 'id' | 'type' | 'url' | 'title'>[]>([]);
	const NODE_ICONS: Partial<Record<Node['type'], string>> = { center: '👋', category: '🧭', subcategory: '📂', node: '💡', citation: '🔗' };
	usePageCommands(() => [{
		label: 'In the graph',
		items: shownNodes
			.filter((node) => node.id !== focusedNode && node.type !== 'loading')
			.map((node) => ({
				value: `graph:${node.id}`,
				label: node.type === 'citation' ? node.title || node.url || node.id : node.id,
				icon: NODE_ICONS[node.type],
				external: node.type === 'citation' && !(node.url && wikiHref(node.url)),
				keywords: ['graph', 'topic']
			})),
		run: (value) => {
			const id = value.slice('graph:'.length);
			const node = shownNodes.find((shown) => shown.id === id);
			if (node?.type === 'citation') {
				preview = null;
				if (node.url) openSource(node.url);
				return;
			}
			if (node) cueFocus(node);
			applyFocusMode(id);
			focusNodeId = id;
			onTopicClick?.(id);
		}
	}]);
	/** Casey's own wiki pages open in the wiki browser here; other sources open in a new tab. */
	function openSource(url: string) {
		// Before opening the tab, which uses up the click's permission to play sound.
		cue('navigate');
		const local = wikiHref(url);
		if (local) goto(local);
		else window.open(url, '_blank');
	}

	let svg: any;
	let simulation: any;
	let nodeSelection: any;
	let linkSelection: any;

	// A link node's preview card. With a mouse it follows the pointer while it is over the node;
	// on touch the first tap holds it open beside the node, and pressing the card opens the page.
	type Preview =
		| { mode: 'hover'; node: Node; x: number; y: number }
		| { mode: 'tap'; node: Node; anchor: Element };
	let preview = $state.raw<Preview | null>(null);
	let previewImage = $state<LinkPreviewImage>('loading');
	let previewCard = $state<HTMLAnchorElement>();
	let previewPosition = $state<{ left: number; top: number } | null>(null);
	let hasShownPulse = false;
	let coachmarkTimeout: ReturnType<typeof setTimeout> | null = null;
	let coachmarkCycleCount = 0;
	const maxCoachmarkCycles = 3; // Number of full cycles through all category nodes

	// Screenshot cache: Map<url, 'loading' | 'error' | dataUrl>
	// Using regular Map (not SvelteMap) to avoid triggering reactivity on cache updates
	let screenshotCache = new Map<string, string>();

	// Start cycling coachmark animation through category nodes
	function startCoachmarkAnimation() {
		// Clear any existing timeout
		stopCoachmarkAnimation();

		// Only run when Casey is focused (category nodes visible)
		if (focusedNode !== 'Casey' || !nodeSelection) return;

		// Get all category nodes
		const categoryNodes: string[] = [];
		nodeSelection.each(function(this: SVGGElement, d: Node) {
			if (d.type === 'category') {
				categoryNodes.push(d.id);
			}
		});

		if (categoryNodes.length === 0) return;

		let currentIndex = 0;
		coachmarkCycleCount = 0;

		// Function to pulse the next node in sequence
		const pulseNextNode = () => {
			// Stop if we're no longer on Casey or have completed cycles
			if (focusedNode !== 'Casey' || !nodeSelection || coachmarkCycleCount >= maxCoachmarkCycles) {
				stopCoachmarkAnimation();
				return;
			}

			const targetNodeId = categoryNodes[currentIndex];

			nodeSelection.each(function(this: SVGGElement, d: Node) {
				if (d.id === targetNodeId) {
					const node = select(this);
					const ring = node.append('circle')
						.attr('class', 'coachmark-ring')
						.attr('r', 6)
						.style('fill', 'none')
						.style('stroke', 'rgba(100, 100, 255, 0.5)')
						.style('stroke-width', '2px');

					ring.transition()
						.duration(2000)
						.ease(easeCubicOut)
						.attr('r', 35)
						.style('stroke-opacity', 0)
						.on('end', function() {
							select(this).remove();
						});
				}
			});

			// Move to next node
			currentIndex++;
			if (currentIndex >= categoryNodes.length) {
				currentIndex = 0;
				coachmarkCycleCount++;
			}

			// Schedule next pulse (slower, more meditative pace)
			if (coachmarkCycleCount < maxCoachmarkCycles) {
				coachmarkTimeout = setTimeout(pulseNextNode, 2500);
			}
		};

		// Start after a brief delay
		coachmarkTimeout = setTimeout(pulseNextNode, 1500);
	}

	// Stop coachmark animation
	function stopCoachmarkAnimation() {
		if (coachmarkTimeout) {
			clearTimeout(coachmarkTimeout);
			coachmarkTimeout = null;
		}
	}

	onDestroy(() => {
		stopCoachmarkAnimation();
		simulation?.stop();
	});

	// Fetch screenshot for a URL
	const screenshotRequests = new Map<string, Promise<void>>();
	function fetchScreenshot(url: string): Promise<void> {
		let request = screenshotRequests.get(url);
		if (!request) {
			request = loadScreenshot(url);
			screenshotRequests.set(url, request);
		}
		return request;
	}

	async function loadScreenshot(url: string): Promise<void> {
		screenshotCache.set(url, 'loading');

		try {
			const response = await fetch(`/api/screenshot?url=${encodeURIComponent(url)}`);
			if (response.ok) {
				const blob = await response.blob();
				const dataUrl = URL.createObjectURL(blob);
				screenshotCache.set(url, dataUrl);
			} else {
				screenshotCache.set(url, 'error');
			}
		} catch {
			screenshotCache.set(url, 'error');
		}
	}

	// Prefetch screenshots for all citation URLs in parallel
	function prefetchCitationScreenshots(nodes: Node[]): void {
		const citationUrls = nodes
			.filter(n => n.type === 'citation' && n.url)
			.map(n => n.url!)
			.filter(url => !screenshotCache.has(url));

		// Fire off all fetches in parallel (don't await)
		citationUrls.forEach(url => {
			fetchScreenshot(url);
		});
	}

	function screenshotFor(url: string): LinkPreviewImage {
		const status = screenshotCache.get(url);
		if (!status || status === 'loading') return 'loading';
		if (status === 'error') return 'error';
		return { src: status };
	}

	function showPreview(next: Preview) {
		const url = next.node.url!;
		preview = next;
		previewImage = screenshotFor(url);
		if (previewImage === 'loading') {
			fetchScreenshot(url).then(() => {
				if (preview?.node.url === url) previewImage = screenshotFor(url);
			});
		}
	}

	// iOS Safari reports the click that follows a tap with pointerType "mouse", so a click
	// is judged by the press that started it: the last pointerdown anywhere on the page.
	let lastPressType = '';
	$effect(() => {
		const onPress = (event: PointerEvent) => (lastPressType = event.pointerType);
		window.addEventListener('pointerdown', onPress, true);
		return () => window.removeEventListener('pointerdown', onPress, true);
	});

	/** A tap or pen press, rather than a mouse click. */
	function isTouch(): boolean {
		if (lastPressType) return lastPressType !== 'mouse';
		return window.matchMedia('(hover: none)').matches;
	}

	// Place the card beside the pointer (hover) or the node (tap), kept inside the viewport.
	$effect(() => {
		const current = preview;
		const card = previewCard;
		void previewImage;
		if (!current || !card) {
			previewPosition = null;
			return;
		}
		const gutter = 16;
		const gap = 12;
		const { innerWidth: vw, innerHeight: vh } = window;
		const w = card.offsetWidth;
		const h = card.offsetHeight;
		let left: number;
		let top: number;
		if (current.mode === 'hover') {
			left = current.x + gap + w > vw - gutter ? current.x - gap - w : current.x + gap;
			top = current.y + gap + h > vh - gutter ? current.y - gap - h : current.y + gap;
		} else {
			const r = current.anchor.getBoundingClientRect();
			left = r.left + r.width / 2 - w / 2;
			top = r.bottom + gap + h <= vh - gutter ? r.bottom + gap : r.top - gap - h;
		}
		previewPosition = {
			left: Math.max(gutter, Math.min(left, vw - w - gutter)),
			top: Math.max(gutter, Math.min(top, vh - h - gutter))
		};
	});

	// A held-open card closes on a press anywhere else, on scroll, or on Escape.
	$effect(() => {
		if (preview?.mode !== 'tap') return;
		const { anchor } = preview;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as globalThis.Node;
			if (previewCard?.contains(target) || anchor.contains(target)) return;
			preview = null;
		};
		const close = () => (preview = null);
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('scroll', close, { passive: true });
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('scroll', close);
			window.removeEventListener('keydown', onKey);
		};
	});

	function portal(element: HTMLElement) {
		document.body.appendChild(element);
		return { destroy: () => element.remove() };
	}

	// Build dynamic nodes and links from insights data
	function buildDynamicGraph() {
		const dynamicNodes: Node[] = [];
		const dynamicLinks: Link[] = [];
		const dynamicNodeIds = new Set<string>();

		// Add loading placeholder nodes for topics currently being fetched
		// Each loading node is attached to its specific topic, not the current focused node
		if (loadingTopics.length > 0) {
			loadingTopics.forEach((topic, idx) => {
				const loadingId = `loading:${topic}:${idx}`;
				dynamicNodes.push({
					id: loadingId,
					type: 'loading',
					parent: topic,  // Attach to the specific topic being loaded
					selected: false
				});
				dynamicNodeIds.add(loadingId);
				dynamicLinks.push({
					source: topic,
					target: loadingId
				});
			});
		}

		if (!insightsData) return forLayout([...allNodes], [...allLinks, ...dynamicLinks]);

		// Create citation nodes and recommended topic nodes for each topic
		insightsData.forEach((insight, topicId) => {
			// Add citation nodes
			if (insight.sources && insight.sources.length > 0) {
				insight.sources.forEach((source) => {
					// Keyed by URL so a pinned source added in front doesn't take another node's place
					const citationId = `citation:${topicId}:${urlKey(source.url)}`;
					if (dynamicNodeIds.has(citationId)) return;

					// Add citation node
					dynamicNodes.push({
						id: citationId,
						type: 'citation',
						parent: topicId,
						selected: false,
						url: source.url,
						title: source.title,
						page_age: source.page_age,
						cited_text: source.cited_text,
						pinned: source.pinned
					});
					dynamicNodeIds.add(citationId);

					// Add link from topic to citation
					dynamicLinks.push({
						source: topicId,
						target: citationId
					});
				});
			}

			// Add recommended topic nodes
			if (insight.recommendedTopics && insight.recommendedTopics.length > 0) {
				console.log(`📌 Topic "${topicId}" has ${insight.recommendedTopics.length} recommendations:`, insight.recommendedTopics);
				insight.recommendedTopics.forEach((recommendedTopic) => {
					// Only add as a new node if it doesn't already exist in the base graph or dynamic nodes
					const existsInBase = allNodes.some(n => n.id === recommendedTopic);
					if (!existsInBase && !dynamicNodeIds.has(recommendedTopic)) {
						console.log(`  ✅ Creating new node for "${recommendedTopic}"`);
						dynamicNodes.push({
							id: recommendedTopic,
							type: 'node',
							parent: topicId,
							selected: false
						});
						dynamicNodeIds.add(recommendedTopic);
					} else {
						console.log(`  ⚠️ Node "${recommendedTopic}" already exists (in base: ${existsInBase}, in dynamic: ${dynamicNodeIds.has(recommendedTopic)})`);
					}

					// Always add the link (even if node already exists)
					dynamicLinks.push({
						source: topicId,
						target: recommendedTopic
					});
					console.log(`  🔗 Created link: ${topicId} -> ${recommendedTopic}`);
				});
			}
		});

		// Pinned sources can name a topic that isn't in the graph yet; a link to a missing node breaks the layout.
		const nodes = [...allNodes, ...dynamicNodes];
		const ids = new Set(nodes.map((n) => n.id));
		return forLayout(
			nodes.filter((n) => n.type !== 'citation' || ids.has(n.parent ?? '')),
			[...allLinks, ...dynamicLinks.filter((l) => ids.has(endpoint(l.source)) && ids.has(endpoint(l.target)))]
		);
	}

	const endpoint = (end: string | Node) => (typeof end === 'string' ? end : end.id);

	// The simulation writes positions and velocities onto the nodes it is given, and the base graph
	// lives in a shared module. Each graph keeps its own copy of every node, so coming back to the page
	// starts from a fresh layout like a full load instead of from where the last visit left off.
	const layoutNodes = new Map<string, Node>();
	function forLayout(nodes: Node[], links: Link[]): { nodes: Node[]; links: Link[] } {
		return {
			nodes: nodes.map((node) => {
				const { x, y, vx, vy, fx, fy, index, ...data } = node as Node & Record<string, unknown>;
				const own = layoutNodes.get(node.id);
				if (own) return Object.assign(own, data);
				const fresh = { ...data } as Node;
				layoutNodes.set(node.id, fresh);
				return fresh;
			}),
			// forceLink swaps ids for node objects, so hand it ids each time.
			links: links.map((link) => ({ source: endpoint(link.source), target: endpoint(link.target) }))
		};
	}

	// Watch for external focus requests
	$effect(() => {
		if (focusNodeId !== undefined && focusNodeId !== focusedNode) {
			preview = null;
			applyFocusMode(focusNodeId);
		}
	});

	// Watch for changes to insights data (new citations added)
	$effect(() => {
		// Track insightsData to detect changes
		const _ = insightsData;

		// If we have a focused node and the simulation is initialized, refresh the graph
		if (focusedNode && simulation) {
			applyFocusMode(focusedNode);
		}

		// Prefetch screenshots for any new citation nodes
		if (insightsData) {
			const { nodes } = buildDynamicGraph();
			prefetchCitationScreenshots(nodes);
		}
	});

	// Watch for changes to loading topics
	$effect(() => {
		// Track loadingTopics to detect changes
		const _ = loadingTopics.length;

		// If we have a focused node and the simulation is initialized, refresh the graph
		if (focusedNode && simulation) {
			applyFocusMode(focusedNode);
		}
	});

	// Get path from a node back to Casey plus immediate connections
	// Now accepts currentLinks to include dynamic links from recommended topics
	function getPathAndConnections(nodeId: string, currentLinks: Link[]): { nodes: Set<string>; links: Set<string> } {
		const visibleNodes = new Set<string>();
		const visibleLinks = new Set<string>();

		// Add the clicked node
		visibleNodes.add(nodeId);

		// Find ALL parent connections for this node (it may have multiple)
		// Use a queue to trace all paths back to Casey
		const nodesToProcess = [nodeId];
		const processed = new Set<string>();

		while (nodesToProcess.length > 0) {
			const currentNodeId = nodesToProcess.shift()!;
			if (processed.has(currentNodeId)) continue;
			processed.add(currentNodeId);

			// Find all links where this node is the target (incoming links)
			// Search through ALL links including dynamic ones
			currentLinks.forEach((link) => {
				const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
				const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

				if (targetId === currentNodeId) {
					// Add the parent node and link
					visibleNodes.add(sourceId);
					visibleLinks.add(`${sourceId}-${targetId}`);

					// Queue the parent for processing (to trace further up)
					if (!processed.has(sourceId)) {
						nodesToProcess.push(sourceId);
					}
				}
			});
		}

		// Add immediate connections (siblings or other nodes connected to this one)
		// Search through ALL links including dynamic ones
		currentLinks.forEach((link) => {
			const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
			const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

			// If link involves the clicked node, include both nodes and the link
			if (sourceId === nodeId || targetId === nodeId) {
				visibleNodes.add(sourceId);
				visibleNodes.add(targetId);
				visibleLinks.add(`${sourceId}-${targetId}`);
			}
		});

		return { nodes: visibleNodes, links: visibleLinks };
	}

	// Apply focus mode to graph by filtering data and updating simulation
	function applyFocusMode(nodeId: string | null) {
		if (!svg || !simulation || !nodeSelection || !linkSelection) {
			return;
		}

		// Build the current graph with dynamic citation nodes
		const { nodes: currentNodes, links: currentLinks } = buildDynamicGraph();

		let filteredNodes: Node[];
		let filteredLinks: Link[];

		if (!nodeId) {
			focusedNode = null;

			// Show Casey and its direct connections
			const caseyDirectConnections = new Set<string>();
			caseyDirectConnections.add('Casey');

			currentLinks.forEach((link) => {
				const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
				const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

				if (sourceId === 'Casey') {
					caseyDirectConnections.add(targetId);
				} else if (targetId === 'Casey') {
					caseyDirectConnections.add(sourceId);
				}
			});

			filteredNodes = currentNodes.filter((n) => caseyDirectConnections.has(n.id));
			filteredLinks = currentLinks.filter((l) => {
				const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
				const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;
				return sourceId === 'Casey' || targetId === 'Casey';
			});
		} else {
			focusedNode = nodeId;
			const { nodes: visibleNodeIds, links: visibleLinkKeys } = getPathAndConnections(nodeId, currentLinks);

			// Add citation nodes for the focused node
			currentNodes.forEach((n) => {
				if (n.type === 'citation' && n.parent === nodeId) {
					visibleNodeIds.add(n.id);
				}
			});

			// Add links to citation nodes
			currentLinks.forEach((l) => {
				const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
				const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;

				// Include links to/from citations of the focused node
				if ((sourceId === nodeId && targetId.startsWith('citation:')) ||
				    (targetId === nodeId && sourceId.startsWith('citation:'))) {
					visibleLinkKeys.add(`${sourceId}-${targetId}`);
				}
			});

			// Filter nodes and links from currentNodes/currentLinks
			filteredNodes = currentNodes.filter((n) => visibleNodeIds.has(n.id));
			filteredLinks = currentLinks.filter((l) => {
				const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
				const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;
				const linkKey = `${sourceId}-${targetId}`;
				return visibleLinkKeys.has(linkKey);
			});
		}

		shownNodes = filteredNodes.map(({ id, type, url, title }) => ({ id, type, url, title }));

		// Update links
		linkSelection = linkSelection.data(filteredLinks, (d: any) => {
			const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
			const targetId = typeof d.target === 'string' ? d.target : d.target.id;
			return `${sourceId}-${targetId}`;
		});

		// Fade out exiting links
		linkSelection.exit()
			.transition()
			.duration(300)
			.style('opacity', 0)
			.remove();

		// Fade in entering links
		linkSelection = linkSelection
			.enter()
			.append('line')
			.attr('stroke', 'white')
			.attr('stroke-width', 2)
			.attr('class', 'link')
			.attr('opacity', 0)
			.merge(linkSelection);

		linkSelection
			.transition()
			.duration(300)
			.attr('opacity', 0.25);

		// Apply focused styling to links - mark path-to-casey links as blue
		if (focusedNode !== null) {
			// Build the path from focused node back to Casey by traversing up the hierarchy
			const pathNodes = new Set<string>();
			pathNodes.add(focusedNode);

			// Traverse up to Casey using current links (which includes dynamic links)
			let currentNodeId: string | null = focusedNode;
			const visited = new Set<string>();

			while (currentNodeId && currentNodeId !== 'Casey' && !visited.has(currentNodeId)) {
				visited.add(currentNodeId);

				// Find the parent by looking for incoming links
				for (const link of currentLinks) {
					const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
					const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

					if (targetId === currentNodeId) {
						pathNodes.add(sourceId);
						currentNodeId = sourceId;
						break;
					}
				}
			}

			linkSelection.each(function(this: SVGLineElement, d: any) {
				const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
				const targetId = typeof d.target === 'string' ? d.target : d.target.id;

				// Check if this link is part of the hierarchical path to Casey
				const isPathToCasey = pathNodes.has(sourceId) && pathNodes.has(targetId);

				select(this)
					.classed('path-to-casey', isPathToCasey)
					.attr('stroke', isPathToCasey ? 'blue' : 'white')
					.attr('opacity', isPathToCasey ? 1 : 0.25);
			});
		} else {
			// No focus, all links are white at 25% opacity
			linkSelection
				.classed('path-to-casey', false)
				.attr('stroke', 'white')
				.attr('opacity', 0.25);
		}

		// Update nodes
		nodeSelection = nodeSelection.data(filteredNodes, (d: Node) => d.id);

		// Fade out exiting nodes
		nodeSelection.exit()
			.transition()
			.duration(300)
			.style('opacity', 0)
			.remove();

		// Create entering nodes with initial opacity
		const nodeEnter = nodeSelection
			.enter()
			.append('g')
			.attr('class', (d: Node) => {
				const classes = ['node', d.type];
				return classes.join(' ');
			})
			.style('opacity', 0)
			.call(
				drag<any, any>()
					.on('start', dragstarted)
					.on('drag', dragged)
					.on('end', dragended)
			);

		// Add circles or favicons - all white by default
		nodeEnter.each(function(this: SVGGElement, d: Node) {
			if (d.type === 'loading') {
				// Loading placeholder nodes: cycling shapes with shimmer label
				const node = select(this);

				// Create a group for the shape that will cycle
				const shapeGroup = node.append('g').attr('class', 'loading-shape-group');

				// Add shapes that will be shown/hidden in sequence
				// Circle
				shapeGroup.append('circle')
					.attr('r', 5)
					.attr('fill', 'white')
					.attr('class', 'loading-shape shape-circle');

				// Star (5-pointed)
				shapeGroup.append('polygon')
					.attr('points', '0,-6 1.5,-2 6,-2 2.5,1 4,6 0,3 -4,6 -2.5,1 -6,-2 -1.5,-2')
					.attr('fill', 'white')
					.attr('class', 'loading-shape shape-star')
					.style('opacity', 0);

				// Triangle
				shapeGroup.append('polygon')
					.attr('points', '0,-6 6,5 -6,5')
					.attr('fill', 'white')
					.attr('class', 'loading-shape shape-triangle')
					.style('opacity', 0);

				// Square (diamond orientation)
				shapeGroup.append('rect')
					.attr('x', -4)
					.attr('y', -4)
					.attr('width', 8)
					.attr('height', 8)
					.attr('transform', 'rotate(45)')
					.attr('fill', 'white')
					.attr('class', 'loading-shape shape-square')
					.style('opacity', 0);

				// Add "Researching" label with letter-by-letter shimmer
				const label = node.append('text')
					.attr('dy', -14)
					.attr('class', 'researching-label')
					.attr('text-anchor', 'middle')
					.style('font-size', '12px')
					.style('font-weight', '300')
					.style('font-style', 'italic');

				// Split into individual letters with staggered animation delays
				const text = 'Researching';
				text.split('').forEach((char, i) => {
					label.append('tspan')
						.text(char)
						.attr('fill', 'white')
						.attr('class', `shimmer-letter shimmer-letter-${i}`);
				});
			} else if (d.type === 'citation' && d.url) {
				// Citation nodes: show only favicon
				const favicon = faviconUrl(d.url);

				// Add a white circle background
				select(this)
					.append('circle')
					.attr('r', 8)
					.attr('fill', 'white');

				// Add favicon image
				select(this)
					.append('image')
					.attr('xlink:href', favicon)
					.attr('x', -8)
					.attr('y', -8)
					.attr('width', 16)
					.attr('height', 16)
					.attr('class', 'favicon');
			} else {
				// Regular nodes: just circles
				select(this)
					.append('circle')
					.attr('r', (d.type === 'center') ? 8 : (d.type === 'category') ? 6 : 4)
					.attr('fill', 'white');
			}
		});

		// Add text labels (skip citation and loading nodes)
		nodeEnter.each(function(this: SVGGElement, d: Node) {
			if (d.type !== 'citation' && d.type !== 'loading') {
				select(this)
					.append('text')
					.attr('dy', -12)
					.text(d.id)
					.attr('text-anchor', 'middle')
					.attr('fill', 'white')
					.style('font-size', () => {
						if (d.type === 'center') return '18px';
						if (d.type === 'category') return '16px';
						return '14px';
					})
					.style('font-weight', () => {
						if (d.type === 'center') return '400';
						if (d.type === 'category') return '400';
						return '300';
					})
					.style('pointer-events', 'all')
					.style('cursor', 'pointer')
					.style('user-select', 'none');
			}
		});

		// Add label backgrounds - transparent by default (skip citation and loading nodes)
		nodeEnter.each(function (this: SVGGElement, d: Node) {
			if (d.type !== 'citation' && d.type !== 'loading') {
				const textNode = select(this).select('text');
				if (!textNode.empty()) {
					const bbox = (textNode.node() as SVGTextElement).getBBox();

					select(this)
						.insert('rect', 'text')
						.attr('class', 'label-bg')
						.attr('x', bbox.x - 2)
						.attr('y', bbox.y + 1)
						.attr('width', bbox.width + 4)
						.attr('height', bbox.height - 2)
						.attr('fill', 'transparent')
						.attr('rx', 0)
						.attr('ry', 0);
				}
			}
		});

		// Fade in only the newly entering nodes (no transform transition to avoid fighting with force simulation)
		nodeEnter
			.transition()
			.duration(300)
			.style('opacity', 1);

		nodeSelection = nodeEnter.merge(nodeSelection);
		nodeSelection.classed('pinned', (d: Node) => !!d.pinned);

		// Apply active state and manage coachmark rings
		nodeSelection.classed('active', (d: Node) => d.id === focusedNode);
		nodeSelection.classed('focused', focusedNode !== null);

		// Add/remove coachmark rings for active nodes
		nodeSelection.each(function(this: SVGGElement, d: Node) {
			const node = select(this);
			node.selectAll('.coachmark-ring').remove();
		});

		// Attach click and hover handlers to new nodes
		nodeSelection
			.on('click', function (this: SVGGElement, event: MouseEvent, d: Node) {
				event.stopPropagation();

				// Loading nodes are not clickable
				if (d.type === 'loading') {
					return;
				}

				// Link nodes open their page. On touch, the first tap shows the preview card instead,
				// and a second tap (on the node or the card) opens the page.
				if (d.type === 'citation') {
					if (!d.url) return;
					const held = preview?.mode === 'tap' && preview.node.id === d.id;
					if (isTouch() && !held) {
						showPreview({ mode: 'tap', node: d, anchor: this });
						return;
					}
					preview = null;
					openSource(d.url);
					return;
				}

				preview = null;

				// Clicking the focused node does nothing
				if (focusedNode === d.id) {
					return;
				}

				// Focus on the clicked node (including Casey)
				cueFocus(d);
				applyFocusMode(d.id);
				focusNodeId = d.id;
				if (onTopicClick) {
					onTopicClick(d.id);
				}
			})
			.on('contextmenu', function (event: MouseEvent, d: Node) {
				if (!onNodeContextMenu || d.type === 'loading') return;
				event.preventDefault();
				event.stopPropagation();
				preview = null;
				onNodeContextMenu(d, event);
			})
			.on('pointerenter', function (event: PointerEvent, d: Node) {
				if (event.pointerType !== 'mouse' || d.type !== 'citation' || !d.url) return;
				if (preview?.mode === 'tap') return;
				showPreview({ mode: 'hover', node: d, x: event.clientX, y: event.clientY });
			})
			.on('pointermove', function (event: PointerEvent, d: Node) {
				if (preview?.mode !== 'hover' || preview.node.id !== d.id) return;
				preview = { ...preview, x: event.clientX, y: event.clientY };
			})
			.on('pointerleave', function (_event: PointerEvent, d: Node) {
				if (preview?.mode === 'hover' && preview.node.id === d.id) preview = null;
			});

		// Update simulation with filtered data
		simulation.nodes(filteredNodes);
		simulation.force('link').links(filteredLinks);

		// Gently restart simulation with lower alpha for smoother transitions
		// Use 0.3 instead of 1 to avoid jerky movements
		simulation.alpha(0.3).alphaTarget(0).restart();

		// Start coachmark animation on the active node
		startCoachmarkAnimation();
	}

	// Drag functions for the simulation
	// A drag only counts once the node has moved; a press that stays put is a click.
	let dragMoved = false;
	function dragstarted(event: any) {
		dragMoved = false;
		if (!event.active) simulation.alphaTarget(0.3).restart();
		event.subject.fx = event.subject.x;
		event.subject.fy = event.subject.y;
	}

	function dragged(event: any) {
		dragMoved = true;
		event.subject.fx = event.x;
		event.subject.fy = event.y;
	}

	function dragended(event: any) {
		if (dragMoved) cue('tap');
		if (!event.active) simulation.alphaTarget(0);
		event.subject.fx = null;
		event.subject.fy = null;
	}

	onMount(() => {
		if (!browser) return;

		const width = graphContainer.clientWidth;
		const height = graphContainer.clientHeight;

		// Create SVG
		svg = select(graphContainer)
			.append('svg')
			.attr('width', '100%')
			.attr('height', '100%')
			.attr('viewBox', [0, 0, width, height]);

		// Create link group
		const linkGroup = svg.append('g');

		// Create node group
		const nodeGroup = svg.append('g');

		// Initialize empty selections
		linkSelection = linkGroup.selectAll('line');
		nodeSelection = nodeGroup.selectAll('g');

		// Create force simulation
		simulation = forceSimulation()
			.force(
				'link',
				forceLink()
					.id((d: any) => d.id)
					.distance(80)
			)
			.force('charge', forceManyBody().strength(-200))
			.force('center', forceCenter(width / 2, height / 2))
			.force('collision', forceCollide().radius(40));

		// Update positions on tick
		simulation.on('tick', () => {
			linkSelection
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			nodeSelection.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
		});

		// Background clicks do nothing - focus remains on selected node

		// Initialize with Casey selected by default
		applyFocusMode('Casey');

		// Show ping animation on a random category node after initial render
		if (!hasShownPulse) {
			hasShownPulse = true;
			// Wait for the simulation to settle a bit
			setTimeout(() => {
				// Get category nodes (direct children of Casey)
				const categoryNodes = allNodes.filter(n => n.type === 'category');
				if (categoryNodes.length > 0) {
					// Pick a random category node
					const randomNode = categoryNodes[Math.floor(Math.random() * categoryNodes.length)];
					// Find the node element and add ping rings
					nodeSelection.each(function(this: SVGGElement, d: Node) {
						if (d.id === randomNode.id) {
							const node = select(this);
							// Create multiple expanding rings
							for (let i = 0; i < 3; i++) {
								setTimeout(() => {
									const ring = node.append('circle')
										.attr('r', 6)
										.attr('class', 'ping-ring')
										.style('fill', 'none')
										.style('stroke', 'rgba(100, 100, 255, 0.6)')
										.style('stroke-width', '2px');

									// Animate the ring expanding and fading
									ring.transition()
										.duration(1500)
										.ease(easeQuadOut)
										.attr('r', 50)
										.style('stroke-width', '0.5px')
										.style('stroke-opacity', 0)
										.remove();
								}, i * 400);
							}
						}
					});
				}
			}, 1200);
		}
	});
</script>

<div bind:this={graphContainer} class="skills-graph"></div>

{#if preview?.node.url}
	<div
		class="graph-link-preview"
		use:portal
		style:left="{previewPosition?.left ?? 0}px"
		style:top="{previewPosition?.top ?? 0}px"
		style:visibility={previewPosition ? 'visible' : 'hidden'}
	>
		<LinkPreviewCard
			bind:element={previewCard}
			href={preview.node.url}
			localHref={wikiHref(preview.node.url) ?? undefined}
			title={preview.node.title || undefined}
			excerpt={preview.node.cited_text || undefined}
			image={previewImage}
			interactive={preview.mode === 'tap'}
			onopen={() => (preview = null)}
		/>
	</div>
{/if}

<style>
	.skills-graph {
		width: 100%;
		height: 100%;
		min-height: 300px;
	}

	.skills-graph :global(svg) {
		width: 100%;
		height: 100%;
	}

	/* All nodes are white by default */
	.skills-graph :global(.node circle) {
		cursor: pointer;
		fill: white;
		stroke: none;
		transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	/* A source the owner chose to always show. */
	.skills-graph :global(.node.citation.pinned > circle) {
		stroke: var(--accent);
		stroke-width: 3px;
	}

	.skills-graph :global(.node text) {
		cursor: pointer;
		fill: white;
	}

	.skills-graph :global(.node) {
		transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.skills-graph :global(.node.hidden) {
		opacity: 0;
		pointer-events: none;
	}

	.skills-graph :global(.node.highlighted text) {
		fill: rgb(100, 100, 255);
		font-weight: 500;
	}

	.skills-graph :global(line.highlighted) {
		stroke: rgb(100, 100, 255) !important;
		stroke-width: 3 !important;
		opacity: 1 !important;
	}

	/* Label backgrounds transparent by default */
	.skills-graph :global(.label-bg) {
		fill: transparent;
		rx: 0;
		ry: 0;
		opacity: 1;
		transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	/* Hover state - blue background and circle */
	.skills-graph :global(.node:hover .label-bg) {
		fill: blue;
	}

	.skills-graph :global(.node:hover circle) {
		fill: blue;
	}

	.skills-graph :global(.node:hover text) {
		fill: white;
	}

	.skills-graph :global(line) {
		transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.skills-graph :global(line.highlighted) {
		stroke: blue !important;
		stroke-width: 2 !important;
		opacity: 1 !important;
	}

	.skills-graph :global(.node.highlighted circle) {
		fill: blue !important;
	}

	.skills-graph :global(.node.highlighted text) {
		fill: white !important;
	}

	.skills-graph :global(.node.highlighted .label-bg) {
		fill: blue !important;
	}

	.skills-graph :global(.link.hidden) {
		opacity: 0;
	}

	/* Focus mode styles */
	.skills-graph :global(.node.hidden-by-focus) {
		display: none;
	}

	.skills-graph :global(.link.hidden-by-focus) {
		display: none;
	}

	.skills-graph :global(.node.focused) {
		display: block;
	}

	.skills-graph :global(.link.path-to-casey) {
		stroke: blue !important;
		stroke-width: 2 !important;
		opacity: 1 !important;
	}

	/* Active node (the one that was clicked) */
	.skills-graph :global(.node.active circle:not(.coachmark-ring):not(.ping-ring)) {
		fill: blue !important;
	}

	.skills-graph :global(.coachmark-ring),
	.skills-graph :global(.ping-ring) {
		pointer-events: none;
	}

	.skills-graph :global(.node.active text) {
		fill: white !important;
		font-weight: 500 !important;
	}

	.skills-graph :global(.node.active .label-bg) {
		fill: blue !important;
	}

	/* Above the page, outside the graph's own stacking. */
	.graph-link-preview {
		position: fixed;
		z-index: var(--z-nav);
		animation: preview-in 150ms var(--ease-out);
	}

	@keyframes preview-in {
		from { opacity: 0; scale: 0.97; }
	}

	@media (prefers-reduced-motion: reduce) {
		.graph-link-preview {
			animation: none;
		}
	}

	/* Ping ring animation - water droplet effect */
	.skills-graph :global(.ping-ring) {
		pointer-events: none;
	}

	/* Loading node - shape cycling animation (instant swap) */
	@keyframes shape-cycle {
		0%, 24.9% { opacity: 1; }
		25%, 100% { opacity: 0; }
	}

	.skills-graph :global(.loading-shape-group .shape-circle) {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 0s;
	}

	.skills-graph :global(.loading-shape-group .shape-star) {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 0.5s;
	}

	.skills-graph :global(.loading-shape-group .shape-triangle) {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 1s;
	}

	.skills-graph :global(.loading-shape-group .shape-square) {
		animation: shape-cycle 2s steps(1) infinite;
		animation-delay: 1.5s;
	}

	/* Loading node styles */
	.skills-graph :global(.node.loading) {
		pointer-events: none;
	}

	.skills-graph :global(.researching-label) {
		pointer-events: none;
	}

	/* Letter-by-letter shimmer animation */
	@keyframes letter-shimmer {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}

	.skills-graph :global(.shimmer-letter) {
		animation: letter-shimmer 1.5s ease-in-out infinite;
	}

	/* Stagger each letter's animation */
	.skills-graph :global(.shimmer-letter-0) { animation-delay: 0s; }
	.skills-graph :global(.shimmer-letter-1) { animation-delay: 0.1s; }
	.skills-graph :global(.shimmer-letter-2) { animation-delay: 0.2s; }
	.skills-graph :global(.shimmer-letter-3) { animation-delay: 0.3s; }
	.skills-graph :global(.shimmer-letter-4) { animation-delay: 0.4s; }
	.skills-graph :global(.shimmer-letter-5) { animation-delay: 0.5s; }
	.skills-graph :global(.shimmer-letter-6) { animation-delay: 0.6s; }
	.skills-graph :global(.shimmer-letter-7) { animation-delay: 0.7s; }
	.skills-graph :global(.shimmer-letter-8) { animation-delay: 0.8s; }
	.skills-graph :global(.shimmer-letter-9) { animation-delay: 0.9s; }
	.skills-graph :global(.shimmer-letter-10) { animation-delay: 1.0s; }

</style>
