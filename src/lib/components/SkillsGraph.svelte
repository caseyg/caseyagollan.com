<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { SvelteMap } from 'svelte/reactivity';
	import * as d3 from 'd3';
	import { allNodes, allLinks, type Node, type Link } from '$lib/data/graph-data';

	let {
		onTopicClick,
		focusNodeId = $bindable(),
		insightsData,
		loadingTopics = []
	}: {
		onTopicClick?: (topic: string | null) => void;
		focusNodeId?: string | null;
		insightsData?: Map<string, any>;
		loadingTopics?: string[];
	} = $props();

	let graphContainer: HTMLDivElement;
	let focusedNode: string | null = $state(null);
	let svg: any;
	let simulation: any;
	let nodeSelection: any;
	let linkSelection: any;
	let tooltip: any;
	let hasShownPulse = false;
	let coachmarkTimeout: ReturnType<typeof setTimeout> | null = null;
	let coachmarkCycleCount = 0;
	const maxCoachmarkCycles = 3; // Number of full cycles through all category nodes

	// Screenshot cache: Map<url, 'loading' | 'error' | dataUrl>
	let screenshotCache = new SvelteMap<string, string>();

	// Start cycling coachmark animation through category nodes
	function startCoachmarkAnimation() {
		// Clear any existing timeout
		stopCoachmarkAnimation();

		// Only run when Casey is focused (category nodes visible)
		if (focusedNode !== 'Casey' || !nodeSelection) return;

		// Get all category nodes
		const categoryNodes: string[] = [];
		nodeSelection.each(function(d: Node) {
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

			nodeSelection.each(function(d: Node) {
				if (d.id === targetNodeId) {
					const node = d3.select(this);
					const ring = node.append('circle')
						.attr('class', 'coachmark-ring')
						.attr('r', 6)
						.style('fill', 'none')
						.style('stroke', 'rgba(100, 100, 255, 0.5)')
						.style('stroke-width', '2px');

					ring.transition()
						.duration(2000)
						.ease(d3.easeCubicOut)
						.attr('r', 35)
						.style('stroke-opacity', 0)
						.on('end', function() {
							d3.select(this).remove();
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
	});

	// Get favicon URL from a URL
	function getFaviconUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
		} catch {
			return '';
		}
	}

	// Fetch screenshot for a URL
	async function fetchScreenshot(url: string): Promise<void> {
		if (screenshotCache.has(url)) return;

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

	// Get display URL (hostname + path)
	function getDisplayUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			const path = urlObj.pathname.length > 30
				? urlObj.pathname.slice(0, 30) + '...'
				: urlObj.pathname;
			return urlObj.hostname + path;
		} catch {
			return url.slice(0, 40);
		}
	}

	// Update tooltip with screenshot when loaded
	function updateTooltipScreenshot(url: string, d: Node) {
		const status = screenshotCache.get(url);
		if (!status || status === 'loading') return;

		const screenshotHtml = status === 'error'
			? `<div class="tooltip-screenshot-skeleton"><span class="loading-text">Loading...</span></div>`
			: `<img src="${status}" class="tooltip-screenshot-img" alt="Screenshot" />`;

		const faviconUrl = getFaviconUrl(url);
		const displayUrl = getDisplayUrl(url);

		tooltip.html(`<div class="tooltip-browser">
			<div class="tooltip-titlebar">
				<div class="tooltip-traffic-lights">
					<span class="tooltip-light red"></span>
					<span class="tooltip-light yellow"></span>
					<span class="tooltip-light green"></span>
				</div>
				<div class="tooltip-title-text">${d.title || 'Source'}</div>
			</div>
			<div class="tooltip-urlbar">
				<img src="${faviconUrl}" class="tooltip-urlbar-favicon" alt="" />
				<span class="tooltip-urlbar-url">${displayUrl}</span>
			</div>
			<div class="tooltip-screenshot-container">
				${screenshotHtml}
			</div>
			${d.cited_text ? `<div class="tooltip-excerpt-browser">"${d.cited_text}"</div>` : ''}
		</div>`);
	}

	// Build dynamic nodes and links from insights data
	function buildDynamicGraph() {
		const dynamicNodes: Node[] = [];
		const dynamicLinks: Link[] = [];
		const dynamicNodeIds = new Set<string>();

		// Add loading placeholder nodes for topics currently being fetched
		if (loadingTopics.length > 0 && focusedNode) {
			loadingTopics.forEach((topic, idx) => {
				const loadingId = `loading:${topic}:${idx}`;
				dynamicNodes.push({
					id: loadingId,
					type: 'loading',
					parent: focusedNode,
					selected: false
				});
				dynamicNodeIds.add(loadingId);
				dynamicLinks.push({
					source: focusedNode,
					target: loadingId
				});
			});
		}

		if (!insightsData) return { nodes: [...allNodes], links: [...allLinks, ...dynamicLinks] };

		// Create citation nodes and recommended topic nodes for each topic
		insightsData.forEach((insight, topicId) => {
			// Add citation nodes
			if (insight.sources && insight.sources.length > 0) {
				insight.sources.forEach((source, idx) => {
					// Create unique ID for citation node
					const citationId = `citation:${topicId}:${idx}`;

					// Add citation node
					dynamicNodes.push({
						id: citationId,
						type: 'citation',
						parent: topicId,
						selected: false,
						url: source.url,
						title: source.title,
						page_age: source.page_age,
						cited_text: source.cited_text
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

		return {
			nodes: [...allNodes, ...dynamicNodes],
			links: [...allLinks, ...dynamicLinks]
		};
	}

	// Watch for external focus requests
	$effect(() => {
		if (focusNodeId !== undefined && focusNodeId !== focusedNode) {
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

			linkSelection.each(function(d: any) {
				const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
				const targetId = typeof d.target === 'string' ? d.target : d.target.id;

				// Check if this link is part of the hierarchical path to Casey
				const isPathToCasey = pathNodes.has(sourceId) && pathNodes.has(targetId);

				d3.select(this)
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
				d3
					.drag<any, any>()
					.on('start', dragstarted)
					.on('drag', dragged)
					.on('end', dragended)
			);

		// Add circles or favicons - all white by default
		nodeEnter.each(function(d: Node) {
			if (d.type === 'loading') {
				// Loading placeholder nodes: cycling shapes with shimmer label
				const node = d3.select(this);

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
				const faviconUrl = getFaviconUrl(d.url);

				// Add a white circle background
				d3.select(this)
					.append('circle')
					.attr('r', 8)
					.attr('fill', 'white');

				// Add favicon image
				d3.select(this)
					.append('image')
					.attr('xlink:href', faviconUrl)
					.attr('x', -8)
					.attr('y', -8)
					.attr('width', 16)
					.attr('height', 16)
					.attr('class', 'favicon');
			} else {
				// Regular nodes: just circles
				d3.select(this)
					.append('circle')
					.attr('r', (d.type === 'center') ? 8 : (d.type === 'category') ? 6 : 4)
					.attr('fill', 'white');
			}
		});

		// Add text labels (skip citation and loading nodes)
		nodeEnter.each(function(d: Node) {
			if (d.type !== 'citation' && d.type !== 'loading') {
				d3.select(this)
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
		nodeEnter.each(function (d: Node) {
			if (d.type !== 'citation' && d.type !== 'loading') {
				const textNode = d3.select(this).select('text');
				if (!textNode.empty()) {
					const bbox = (textNode.node() as SVGTextElement).getBBox();

					d3.select(this)
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

		// Apply active state and manage coachmark rings
		nodeSelection.classed('active', (d: Node) => d.id === focusedNode);
		nodeSelection.classed('focused', focusedNode !== null);

		// Add/remove coachmark rings for active nodes
		nodeSelection.each(function(d: Node) {
			const node = d3.select(this);
			node.selectAll('.coachmark-ring').remove();
		});

		// Attach click and hover handlers to new nodes
		nodeSelection
			.on('click', function (event: MouseEvent, d: Node) {
				event.stopPropagation();

				// Loading nodes are not clickable
				if (d.type === 'loading') {
					return;
				}

				// Citation nodes don't trigger focus changes
				if (d.type === 'citation') {
					// Maybe open the URL in a new window?
					if (d.url) {
						window.open(d.url, '_blank');
					}
					return;
				}

				// Clicking the focused node does nothing
				if (focusedNode === d.id) {
					return;
				}

				// Focus on the clicked node (including Casey)
				applyFocusMode(d.id);
				focusNodeId = d.id;
				if (onTopicClick) {
					onTopicClick(d.id);
				}
			})
			.on('mouseenter', function (event: MouseEvent, d: Node) {
				// Show tooltip for citation nodes
				if (d.type === 'citation' && d.url) {
					const faviconUrl = getFaviconUrl(d.url);
					const displayUrl = getDisplayUrl(d.url);
					const cachedStatus = screenshotCache.get(d.url);

					// Build screenshot section based on cache status
					let screenshotHtml: string;
					if (!cachedStatus || cachedStatus === 'loading') {
						screenshotHtml = `<div class="tooltip-screenshot-skeleton">
							<span class="loading-text">Loading screenshot</span>
						</div>`;
					} else if (cachedStatus === 'error') {
						screenshotHtml = `<div class="tooltip-screenshot-skeleton">
							<span class="loading-text">Loading...</span>
						</div>`;
					} else {
						screenshotHtml = `<img src="${cachedStatus}" class="tooltip-screenshot-img" alt="Screenshot" />`;
					}

					const tooltipContent = `<div class="tooltip-browser">
						<div class="tooltip-titlebar">
							<div class="tooltip-traffic-lights">
								<span class="tooltip-light red"></span>
								<span class="tooltip-light yellow"></span>
								<span class="tooltip-light green"></span>
							</div>
							<div class="tooltip-title-text">${d.title || 'Source'}</div>
						</div>
						<div class="tooltip-urlbar">
							<img src="${faviconUrl}" class="tooltip-urlbar-favicon" alt="" />
							<span class="tooltip-urlbar-url">${displayUrl}</span>
						</div>
						<div class="tooltip-screenshot-container">
							${screenshotHtml}
						</div>
						${d.cited_text ? `<div class="tooltip-excerpt-browser">"${d.cited_text}"</div>` : ''}
					</div>`;

					tooltip
						.html(tooltipContent)
						.style('left', `${event.pageX + 10}px`)
						.style('top', `${event.pageY - 10}px`)
						.style('opacity', 1)
						.style('display', 'block');

					// Start fetching screenshot if not already cached
					if (!cachedStatus) {
						fetchScreenshot(d.url).then(() => {
							// Update tooltip if still visible
							if (tooltip.style('display') === 'block') {
								updateTooltipScreenshot(d.url!, d);
							}
						});
					}
				}
			})
			.on('mousemove', function (event: MouseEvent, d: Node) {
				if (d.type === 'citation') {
					tooltip
						.style('left', `${event.pageX + 10}px`)
						.style('top', `${event.pageY - 10}px`);
				}
			})
			.on('mouseleave', function (event: MouseEvent, d: Node) {
				if (d.type === 'citation') {
					tooltip
						.style('opacity', 0)
						.style('display', 'none');
				}
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
	function dragstarted(event: any) {
		if (!event.active) simulation.alphaTarget(0.3).restart();
		event.subject.fx = event.subject.x;
		event.subject.fy = event.subject.y;
	}

	function dragged(event: any) {
		event.subject.fx = event.x;
		event.subject.fy = event.y;
	}

	function dragended(event: any) {
		if (!event.active) simulation.alphaTarget(0);
		event.subject.fx = null;
		event.subject.fy = null;
	}

	onMount(() => {
		if (!browser) return;

		const width = graphContainer.clientWidth;
		const height = graphContainer.clientHeight;

		// Create SVG
		svg = d3
			.select(graphContainer)
			.append('svg')
			.attr('width', '100%')
			.attr('height', '100%')
			.attr('viewBox', [0, 0, width, height]);

		// Create tooltip
		tooltip = d3.select('body')
			.append('div')
			.attr('class', 'graph-tooltip')
			.style('position', 'absolute')
			.style('opacity', 0)
			.style('display', 'none')
			.style('pointer-events', 'none');

		// Create link group
		const linkGroup = svg.append('g');

		// Create node group
		const nodeGroup = svg.append('g');

		// Initialize empty selections
		linkSelection = linkGroup.selectAll('line');
		nodeSelection = nodeGroup.selectAll('g');

		// Create force simulation
		simulation = d3
			.forceSimulation()
			.force(
				'link',
				d3
					.forceLink()
					.id((d: any) => d.id)
					.distance(80)
			)
			.force('charge', d3.forceManyBody().strength(-200))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(40));

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
					nodeSelection.each(function(d: Node) {
						if (d.id === randomNode.id) {
							const node = d3.select(this);
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
										.ease(d3.easeQuadOut)
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
	.skills-graph :global(.node.active circle:not(.coachmark-ring)) {
		fill: blue !important;
	}

	.skills-graph :global(.coachmark-ring) {
		pointer-events: none;
	}

	.skills-graph :global(.node.active text) {
		fill: white !important;
		font-weight: 500 !important;
	}

	.skills-graph :global(.node.active .label-bg) {
		fill: blue !important;
	}

	/* Tooltip styles */
	:global(.graph-tooltip) {
		background: rgba(20, 20, 30, 0.98);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		padding: 0.75rem;
		max-width: 300px;
		z-index: 10000;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}

	:global(.tooltip-source) {
		margin-bottom: 0.5rem;
	}

	:global(.tooltip-source:last-child) {
		margin-bottom: 0;
	}

	:global(.tooltip-title) {
		font-weight: 600;
		color: white;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}

	:global(.tooltip-date) {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 0.25rem;
		font-style: italic;
	}

	:global(.tooltip-excerpt) {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.4;
		font-style: italic;
		border-left: 2px solid rgba(73, 73, 255, 0.5);
		padding-left: 0.5rem;
		margin-top: 0.25rem;
	}

	/* Browser-window styled tooltip */
	:global(.graph-tooltip) {
		padding: 0;
		overflow: hidden;
		max-width: 320px;
	}

	:global(.tooltip-browser) {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-width: 280px;
	}

	:global(.tooltip-titlebar) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: rgba(40, 40, 50, 0.95);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	:global(.tooltip-traffic-lights) {
		display: flex;
		gap: 6px;
	}

	:global(.tooltip-light) {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	:global(.tooltip-light.red) {
		background: #ff5f57;
	}

	:global(.tooltip-light.yellow) {
		background: #febc2e;
	}

	:global(.tooltip-light.green) {
		background: #28c840;
	}

	:global(.tooltip-title-text) {
		flex: 1;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.8);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.tooltip-urlbar) {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: rgba(30, 30, 40, 0.95);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	:global(.tooltip-urlbar-favicon) {
		width: 14px;
		height: 14px;
		border-radius: 2px;
	}

	:global(.tooltip-urlbar-url) {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
		font-family: monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.tooltip-screenshot-container) {
		width: 100%;
		min-width: 280px;
		height: 175px;
		background: rgba(20, 20, 30, 1);
		overflow: hidden;
	}

	:global(.tooltip-screenshot-img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top left;
	}

	:global(.tooltip-screenshot-skeleton) {
		width: 100%;
		height: 100%;
		min-height: 175px;
		background: rgba(30, 30, 40, 1);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.tooltip-screenshot-skeleton .loading-text) {
		font-size: 0.8rem;
		font-style: italic;
		background: linear-gradient(90deg, rgba(100, 100, 120, 1) 0%, rgba(180, 180, 200, 1) 50%, rgba(100, 100, 120, 1) 100%);
		background-size: 200% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		animation: text-shimmer 2s linear infinite;
	}

	@keyframes text-shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	:global(.tooltip-screenshot-error) {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.75rem;
		font-style: italic;
	}

	:global(.tooltip-excerpt-browser) {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.4;
		font-style: italic;
		padding: 10px;
		background: rgba(30, 30, 40, 0.95);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		border-left: 2px solid rgba(73, 73, 255, 0.5);
		margin: 0;
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
