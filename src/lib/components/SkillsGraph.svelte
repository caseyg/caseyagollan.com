<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import * as d3 from 'd3';
	import { allNodes, allLinks, type Node, type Link } from '$lib/data/graph-data';

	let {
		onTopicClick,
		focusNodeId = $bindable(),
		insightsData
	}: {
		onTopicClick?: (topic: string | null) => void;
		focusNodeId?: string | null;
		insightsData?: Map<string, any>;
	} = $props();

	let graphContainer: HTMLDivElement;
	let focusedNode: string | null = $state(null);
	let svg: any;
	let simulation: any;
	let nodeSelection: any;
	let linkSelection: any;
	let tooltip: any;

	// Get favicon URL from a URL
	function getFaviconUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
		} catch {
			return '';
		}
	}

	// Build dynamic nodes and links from insights data
	function buildDynamicGraph() {
		const dynamicNodes: Node[] = [];
		const dynamicLinks: Link[] = [];
		const dynamicNodeIds = new Set<string>();

		if (!insightsData) return { nodes: [...allNodes], links: [...allLinks] };

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
	});

	// Get path from a node back to Casey plus immediate connections
	function getPathAndConnections(nodeId: string): { nodes: Set<string>; links: Set<string> } {
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
			allLinks.forEach((link) => {
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
		allLinks.forEach((link) => {
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
			const { nodes: visibleNodeIds, links: visibleLinkKeys } = getPathAndConnections(nodeId);

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
			// Build the path from focused node back to Casey
			const pathNodes = new Set<string>();
			pathNodes.add(focusedNode);

			// Find the focused node's parent
			const focusedNodeObj = allNodes.find((n) => n.id === focusedNode);
			if (focusedNodeObj?.parent) {
				pathNodes.add(focusedNodeObj.parent);

				// If parent is not Casey, add Casey
				if (focusedNodeObj.parent !== 'Casey') {
					pathNodes.add('Casey');
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
			if (d.type === 'citation' && d.url) {
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

		// Add text labels (skip citation nodes)
		nodeEnter.each(function(d: Node) {
			if (d.type !== 'citation') {
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

		// Add label backgrounds - transparent by default (skip citation nodes)
		nodeEnter.each(function (d: Node) {
			if (d.type !== 'citation') {
				const textNode = d3.select(this).select('text');
				if (!textNode.empty()) {
					const bbox = (textNode.node() as SVGTextElement).getBBox();

					d3.select(this)
						.insert('rect', 'text')
						.attr('class', 'label-bg')
						.attr('x', bbox.x - 4)
						.attr('y', bbox.y - 2)
						.attr('width', bbox.width + 8)
						.attr('height', bbox.height + 4)
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

		// Apply active state
		nodeSelection.classed('active', (d: Node) => d.id === focusedNode);
		nodeSelection.classed('focused', focusedNode !== null);

		// Attach click and hover handlers to new nodes
		nodeSelection
			.on('click', function (event: MouseEvent, d: Node) {
				event.stopPropagation();

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
				if (d.type === 'citation') {
					const tooltipContent = `<div class="tooltip-source">
						<div class="tooltip-title">${d.title || 'Source'}</div>
						${d.page_age ? `<div class="tooltip-date">${d.page_age}</div>` : ''}
						${d.cited_text ? `<div class="tooltip-excerpt">"${d.cited_text}"</div>` : ''}
					</div>`;

					tooltip
						.html(tooltipContent)
						.style('left', `${event.pageX + 10}px`)
						.style('top', `${event.pageY - 10}px`)
						.style('opacity', 1)
						.style('display', 'block');
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
			.attr('height', height)
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

		// Initialize with Casey + direct connections
		applyFocusMode(null);
	});
</script>

<div bind:this={graphContainer} class="skills-graph"></div>

<style>
	.skills-graph {
		width: 100%;
		height: 50vh;
		max-height: 600px;
		min-height: 400px;
	}

	@media (max-width: 768px) {
		.skills-graph {
			height: 25vh;
			min-height: 200px;
			max-height: 300px;
		}
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

	/* Active node (the one that was clicked) - blue like hover */
	.skills-graph :global(.node.active circle) {
		fill: blue !important;
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

</style>
