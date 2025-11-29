<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Nav from '$lib/components/Nav.svelte';

	interface PageData {
		graphData: GraphData | null;
	}

	interface Node {
		id: string;
		group: string;
		workcode?: string;
		bookid?: number;
		isbn?: string;
		pages?: number;
		dateacquired?: string;
		publicationYear?: number;
		ddcCode?: string;
		img?: string;
		w?: number;
		h?: number;
		averageColor?: string;
		points?: number;
		x?: number;
		y?: number;
		z?: number;
		fx?: number;
		fy?: number;
		fz?: number;
		__threeObj?: THREE.Mesh;
	}

	interface Link {
		source: string | Node;
		target: string | Node;
	}

	interface GraphData {
		nodes: Node[];
		links: Link[];
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let THREE: any;

	let { data }: { data: PageData } = $props();

	let graphContainer: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let Graph: any;
	let isGridModeActive = $state(false);
	let sortIndex = $state(0);
	const sortModes = ['dateacquired', 'publicationYear', 'ddc', 'color'];
	const sortIcons = ['📅', '⏳', '📖', '🌈'];
	let lastClickedNode: Node | null = null;
	let originalGraphData: GraphData;

	// Performance: Cached materials
	let paperWhiteMaterial: THREE.MeshBasicMaterial;
	const textureCache = new Map<string, THREE.Texture>();
	const materialCache = new Map<string, THREE.MeshBasicMaterial>();

	// Performance: Reusable canvas for texture generation
	let spineCanvas: HTMLCanvasElement;
	let spineCtx: CanvasRenderingContext2D;
	let coverCanvas: HTMLCanvasElement;
	let coverCtx: CanvasRenderingContext2D;

	function initCanvases() {
		spineCanvas = document.createElement('canvas');
		spineCtx = spineCanvas.getContext('2d')!;
		coverCanvas = document.createElement('canvas');
		coverCtx = coverCanvas.getContext('2d')!;
	}

	// Performance: Create spine texture with cached canvas
	function createSpineTexture(
		node: Node,
		depth: number,
		averageColor: string
	): THREE.MeshBasicMaterial {
		const cacheKey = `spine_${node.id}_${depth}_${averageColor}`;
		if (materialCache.has(cacheKey)) {
			return materialCache.get(cacheKey)!;
		}

		spineCanvas.width = Math.max(48, depth * 6);
		spineCanvas.height = 384;

		spineCtx.fillStyle = averageColor;
		spineCtx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

		spineCtx.save();
		spineCtx.translate(spineCanvas.width / 2, spineCanvas.height / 2);
		spineCtx.rotate(-Math.PI / 2);
		spineCtx.fillStyle = 'white';
		spineCtx.strokeStyle = 'black';
		spineCtx.lineWidth = 0.5;

		const baseFontSize = Math.max(20, Math.min(28, spineCanvas.width * 0.4));
		spineCtx.font = `bold ${baseFontSize}px Arial`;
		spineCtx.textAlign = 'center';
		spineCtx.textBaseline = 'middle';

		const words = node.id.split(' ');
		let lines: string[] = [];
		let currentLine = '';
		const maxWidth = spineCanvas.height - 60;

		words.forEach((word) => {
			const testLine = currentLine + (currentLine ? ' ' : '') + word;
			const metrics = spineCtx.measureText(testLine);
			if (metrics.width > maxWidth && currentLine !== '') {
				lines.push(currentLine);
				currentLine = word;
			} else {
				currentLine = testLine;
			}
		});
		lines.push(currentLine);

		if (lines.length > 2) {
			lines = lines.slice(0, 2);
			lines[1] = lines[1].length > 15 ? lines[1].substring(0, 12) + '...' : lines[1];
		}

		const lineHeight = baseFontSize + 4;
		const startY = (-(lines.length - 1) * lineHeight) / 2;

		lines.forEach((line, index) => {
			const y = startY + index * lineHeight;
			spineCtx.lineWidth = 3;
			spineCtx.strokeText(line, 0, y);
			spineCtx.fillText(line, 0, y);
		});

		spineCtx.restore();

		// Create texture from canvas copy (since we reuse canvas)
		const imageData = spineCtx.getImageData(0, 0, spineCanvas.width, spineCanvas.height);
		const texture = new THREE.DataTexture(
			imageData.data,
			spineCanvas.width,
			spineCanvas.height,
			THREE.RGBAFormat
		);
		texture.needsUpdate = true;
		texture.flipY = true;

		const material = new THREE.MeshBasicMaterial({ map: texture });
		materialCache.set(cacheKey, material);
		return material;
	}

	// Performance: Create back cover with cached canvas
	function createBackCoverMaterial(averageColor: string): THREE.MeshBasicMaterial {
		const cacheKey = `back_${averageColor}`;
		if (materialCache.has(cacheKey)) {
			return materialCache.get(cacheKey)!;
		}

		coverCanvas.width = 256;
		coverCanvas.height = 384;
		coverCtx.fillStyle = averageColor;
		coverCtx.fillRect(0, 0, coverCanvas.width, coverCanvas.height);

		const imageData = coverCtx.getImageData(0, 0, coverCanvas.width, coverCanvas.height);
		const texture = new THREE.DataTexture(
			imageData.data,
			coverCanvas.width,
			coverCanvas.height,
			THREE.RGBAFormat
		);
		texture.needsUpdate = true;
		texture.flipY = true;

		const material = new THREE.MeshBasicMaterial({ map: texture });
		materialCache.set(cacheKey, material);
		return material;
	}

	// Performance: Load texture with caching
	function loadTexture(url: string): THREE.Texture {
		if (textureCache.has(url)) {
			return textureCache.get(url)!;
		}

		const loader = new THREE.TextureLoader();
		const texture = loader.load(url);
		textureCache.set(url, texture);
		return texture;
	}

	// Performance: Create placeholder cover for books without images
	function createPlaceholderCover(node: Node): {
		material: THREE.MeshBasicMaterial;
		width: number;
		height: number;
		averageColor: string;
	} {
		const cacheKey = `placeholder_${node.id}`;
		const titleHash = node.id.split('').reduce((a, b) => {
			a = (a << 5) - a + b.charCodeAt(0);
			return a & a;
		}, 0);

		if (materialCache.has(cacheKey)) {
			const hue = Math.abs(titleHash) % 360;
			const randomSeed = Math.abs(titleHash) / 2147483647;
			return {
				material: materialCache.get(cacheKey)!,
				width: (120 + randomSeed * 80) / 10,
				height: (180 + randomSeed * 100) / 10,
				averageColor: `hsl(${hue}, 60%, 45%)`
			};
		}

		coverCanvas.width = 256;
		coverCanvas.height = 384;

		const hue = Math.abs(titleHash) % 360;
		const bgColor = `hsl(${hue}, 60%, 45%)`;
		const textColor = `hsl(${hue}, 60%, 90%)`;

		coverCtx.fillStyle = bgColor;
		coverCtx.fillRect(0, 0, coverCanvas.width, coverCanvas.height);

		coverCtx.fillStyle = textColor;
		coverCtx.font = 'bold 18px Arial';
		coverCtx.textAlign = 'center';
		coverCtx.textBaseline = 'middle';

		const words = node.id.split(' ');
		const lines: string[] = [];
		let currentLine = '';

		words.forEach((word) => {
			const testLine = currentLine + word + ' ';
			const metrics = coverCtx.measureText(testLine);
			if (metrics.width > coverCanvas.width - 40 && currentLine !== '') {
				lines.push(currentLine.trim());
				currentLine = word + ' ';
			} else {
				currentLine = testLine;
			}
		});
		lines.push(currentLine.trim());

		const lineHeight = 22;
		const startY = coverCanvas.height / 2 - (lines.length * lineHeight) / 2;
		lines.forEach((line, index) => {
			coverCtx.fillText(line, coverCanvas.width / 2, startY + index * lineHeight);
		});

		const imageData = coverCtx.getImageData(0, 0, coverCanvas.width, coverCanvas.height);
		const texture = new THREE.DataTexture(
			imageData.data,
			coverCanvas.width,
			coverCanvas.height,
			THREE.RGBAFormat
		);
		texture.needsUpdate = true;
		texture.flipY = true;

		const material = new THREE.MeshBasicMaterial({ map: texture });
		materialCache.set(cacheKey, material);

		const randomSeed = Math.abs(titleHash) / 2147483647;
		return {
			material,
			width: (120 + randomSeed * 80) / 10,
			height: (180 + randomSeed * 100) / 10,
			averageColor: bgColor
		};
	}

	// Create book 3D object
	function createBookObject(node: Node): THREE.Mesh {
		const depth = node.pages ? Math.max(1, Math.ceil(node.pages / 10)) : 20;
		let frontMaterial: THREE.MeshBasicMaterial;
		let spineMaterial: THREE.MeshBasicMaterial;
		let width: number;
		let height: number;
		let averageColor = node.averageColor || '#666666';

		if (node.img && node.w && node.h && !isNaN(node.w) && !isNaN(node.h)) {
			const imgTexture = loadTexture('/library/' + node.img);
			frontMaterial = new THREE.MeshBasicMaterial({ map: imgTexture });
			width = Math.max(0.1, node.w / 10);
			height = Math.max(0.1, node.h / 10);
			spineMaterial = createSpineTexture(node, depth, averageColor);
		} else {
			const placeholder = createPlaceholderCover(node);
			frontMaterial = placeholder.material;
			width = placeholder.width;
			height = placeholder.height;
			averageColor = placeholder.averageColor;
			spineMaterial = createSpineTexture(node, depth, averageColor);
		}

		const depthVal = Math.max(0.1, depth / 10);
		const geometry = new THREE.BoxGeometry(width, height, depthVal);
		const backMaterial = createBackCoverMaterial(averageColor);

		const materials = [
			paperWhiteMaterial,
			spineMaterial,
			paperWhiteMaterial,
			paperWhiteMaterial,
			frontMaterial,
			backMaterial
		];

		const cube = new THREE.Mesh(geometry, materials);

		cube.rotation.x = Math.random() * 2 * Math.PI;
		cube.rotation.y = Math.random() * 2 * Math.PI;
		cube.rotation.z = Math.random() * 2 * Math.PI;

		return cube;
	}

	// Expand minified data if needed
	function expandGraphData(rawData: unknown): GraphData {
		const data = rawData as {
			nodes: Array<{
				i?: string;
				id?: string;
				g?: string;
				group?: string;
				w?: string;
				workcode?: string;
				b?: number;
				bookid?: number;
				n?: string;
				isbn?: string;
				p?: number;
				pages?: number;
				d?: string;
				dateacquired?: string;
				y?: number;
				publicationYear?: number;
				c?: string;
				ddcCode?: string;
				m?: string;
				img?: string;
				x?: number;
				z?: number;
				h?: number;
				a?: string;
				averageColor?: string;
				t?: number;
				points?: number;
			}>;
			links: Array<{ s?: string; source?: string; t?: string; target?: string }>;
		};

		// Check if data is minified (has 'i' key instead of 'id')
		if (data.nodes[0] && 'i' in data.nodes[0]) {
			return {
				nodes: data.nodes.map((n) => ({
					id: n.i!,
					group: n.g!,
					workcode: n.w,
					bookid: n.b,
					isbn: n.n,
					pages: n.p,
					dateacquired: n.d,
					publicationYear: n.y,
					ddcCode: n.c,
					img: n.m,
					w: n.x,
					h: n.z,
					averageColor: n.a,
					points: n.t
				})),
				links: data.links.map((l) => ({
					source: l.s!,
					target: l.t!
				}))
			};
		}

		// Already expanded
		return {
			nodes: data.nodes.map((n) => ({
				id: n.id || n.i!,
				group: n.group || n.g!,
				workcode: n.workcode || n.w,
				bookid: n.bookid || n.b,
				isbn: n.isbn || n.n,
				pages: n.pages || n.p,
				dateacquired: n.dateacquired || n.d,
				publicationYear: n.publicationYear || n.y,
				ddcCode: n.ddcCode || n.c,
				img: n.img || n.m,
				w: n.x,
				h: n.h || n.z,
				averageColor: n.averageColor || n.a,
				points: n.points || n.t
			})),
			links: data.links.map((l) => ({
				source: (l.source || l.s) as string,
				target: (l.target || l.t) as string
			}))
		};
	}

	onMount(async () => {
		if (!browser) return;

		// Initialize reusable canvases
		initCanvases();

		// Dynamic imports
		const [ForceGraph3DModule, THREEModule, SpriteTextModule] = await Promise.all([
			import('3d-force-graph'),
			import('three'),
			import('three-spritetext')
		]);

		const ForceGraph3D = ForceGraph3DModule.default;
		THREE = THREEModule;
		const SpriteText = SpriteTextModule.default;

		// Initialize shared materials
		paperWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f5f0 });

		// Load graph data - use server-provided data or fetch
		let graphData: GraphData;
		if (data.graphData) {
			graphData = data.graphData;
		} else {
			const response = await fetch('/library/graph.json');
			const rawData = await response.json();
			graphData = expandGraphData(rawData);
		}

		Graph = ForceGraph3D()(graphContainer)
			.graphData(graphData)
			.onNodeClick((node: Node) => {
				if (node.group === 'book') {
					if (lastClickedNode === node) {
						Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 3000);
						lastClickedNode = null;
					} else {
						const distance = isGridModeActive ? 20 : 40;
						const nodeZ = node.z || 0;
						const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, nodeZ);
						Graph.cameraPosition(
							{
								x: (node.x || 0) * distRatio,
								y: (node.y || 0) * distRatio,
								z: nodeZ * distRatio
							},
							{ x: node.x || 0, y: node.y || 0, z: nodeZ },
							3000
						);
						lastClickedNode = node;
					}
				}
			})
			.onBackgroundClick(() => {
				Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 3000);
				lastClickedNode = null;
			})
			.onNodeRightClick((node: Node) => {
				if (node.group === 'book') {
					window.open(`https://librarything.com/work/${node.workcode}`, '_blank');
				}
			})
			.nodeThreeObject((node: Node) => {
				if (node.group === 'book') {
					return createBookObject(node);
				} else if (node.group === 'ddc') {
					const sprite = new SpriteText(node.id);
					sprite.color = 'blue';
					sprite.textHeight = Math.max((node.points || 1) / 2, 3);
					return sprite;
				}
				return null;
			})
			.backgroundColor('#808080');

		// Store original data for mode switching
		originalGraphData = { ...Graph.graphData() };
	});

	function toggleMode() {
		if (!Graph) return;

		isGridModeActive = !isGridModeActive;

		if (isGridModeActive) {
			Graph.d3Force('custom', customForce);
			Graph.numDimensions(2);

			let filteredNodes: Node[];
			if (sortModes[sortIndex] === 'ddc') {
				filteredNodes = Graph.graphData().nodes.filter(
					(node: Node) => node.group === 'book' || node.group === 'ddc'
				);
			} else {
				filteredNodes = Graph.graphData().nodes.filter((node: Node) => node.group !== 'ddc');
			}

			filteredNodes.forEach((node: Node) => {
				if (node.group === 'book' && node.__threeObj) {
					node.__threeObj.rotation.set(0, Math.PI / 2, 0);
				}
			});

			originalGraphData = { ...Graph.graphData() };
			Graph.graphData({ nodes: filteredNodes, links: [] });

			Graph.controls().enablePan = false;
			Graph.controls().minPolarAngle = Math.PI / 4;
			Graph.controls().maxPolarAngle = (3 * Math.PI) / 4;
			Graph.controls().enableZoom = true;
		} else {
			Graph.d3Force('custom', null);
			Graph.numDimensions(3);

			const currentData = Graph.graphData() as GraphData;
			const originalNodes = originalGraphData.nodes;
			const originalLinks = originalGraphData.links;

			originalNodes.forEach((node: Node) => {
				if (!currentData.nodes.some((currentNode: Node) => currentNode.id === node.id)) {
					currentData.nodes.push(node);
				}
			});

			currentData.links = [];
			originalLinks.forEach((link: Link) => {
				currentData.links.push(link);
			});

			Graph.graphData({ nodes: currentData.nodes, links: currentData.links });

			Graph.controls().enablePan = true;
			Graph.controls().minPolarAngle = 0;
			Graph.controls().maxPolarAngle = Math.PI;
			Graph.controls().enableZoom = true;

			currentData.nodes.forEach((node: Node) => {
				if (node.group === 'book' && node.__threeObj) {
					const book = node.__threeObj;
					const startRotation = {
						x: book.rotation.x,
						y: book.rotation.y,
						z: book.rotation.z
					};
					const targetRotation = {
						x: Math.random() * 2 * Math.PI,
						y: Math.random() * 2 * Math.PI,
						z: Math.random() * 2 * Math.PI
					};

					let startTime: number | null = null;
					const duration = 1000;

					function animateRotation(timestamp: number) {
						if (!startTime) startTime = timestamp;
						const progress = Math.min((timestamp - startTime) / duration, 1);
						const easeProgress = 1 - Math.pow(1 - progress, 3);

						book.rotation.x =
							startRotation.x + (targetRotation.x - startRotation.x) * easeProgress;
						book.rotation.y =
							startRotation.y + (targetRotation.y - startRotation.y) * easeProgress;
						book.rotation.z =
							startRotation.z + (targetRotation.z - startRotation.z) * easeProgress;

						if (progress < 1) {
							requestAnimationFrame(animateRotation);
						}
					}

					requestAnimationFrame(animateRotation);
				}
			});
		}
	}

	function toggleSort() {
		if (!Graph || !isGridModeActive) return;

		sortIndex = (sortIndex + 1) % sortModes.length;

		let filteredNodes: Node[];
		if (sortModes[sortIndex] === 'ddc') {
			filteredNodes = originalGraphData.nodes.filter(
				(node: Node) => node.group === 'book' || node.group === 'ddc'
			);
		} else {
			filteredNodes = originalGraphData.nodes.filter((node: Node) => node.group !== 'ddc');
		}
		Graph.graphData({ nodes: filteredNodes, links: [] });
		Graph.d3Force('custom', customForce);
	}

	function customForce() {
		if (!Graph) return;

		let nodes = Graph.graphData().nodes.filter((node: Node) => node.group === 'book') as Node[];
		const ddcNodes = Graph.graphData().nodes.filter(
			(node: Node) => node.group === 'ddc'
		) as Node[];

		Graph.graphData().nodes.forEach((node: Node) => {
			if (node.fx !== undefined) delete node.fx;
			if (node.fy !== undefined) delete node.fy;
			if (node.fz !== undefined) delete node.fz;
		});

		const rowSize = 50;
		const nodeSize =
			nodes.length > 0 && nodes[0].__threeObj ? nodes[0].__threeObj.scale.x : 50;
		const spacingX = nodeSize + 5;
		const spacingY = nodeSize + 30;

		if (sortModes[sortIndex] === 'ddc') {
			nodes.sort((a, b) => (a.ddcCode || '').localeCompare(b.ddcCode || ''));

			const ddcGroups: Record<string, Node[]> = {};
			nodes.forEach((node) => {
				const ddcClass = (node.ddcCode || '').substring(0, 3);
				if (!ddcGroups[ddcClass]) {
					ddcGroups[ddcClass] = [];
				}
				ddcGroups[ddcClass].push(node);
			});

			const ddcClassNames: Record<string, string> = {
				'000': 'Computer science, information & general works',
				'100': 'Philosophy & psychology',
				'200': 'Religion',
				'300': 'Social sciences',
				'400': 'Language',
				'500': 'Science & mathematics',
				'600': 'Technology',
				'700': 'Arts & recreation',
				'800': 'Literature',
				'900': 'History & geography'
			};

			let gridIndex = 0;
			const positionMap = new Map<string, number>();

			Object.keys(ddcGroups)
				.sort()
				.forEach((ddcClass) => {
					if (ddcGroups[ddcClass].length > 0) {
						const dividerName = ddcClassNames[ddcClass] || `DDC ${ddcClass}`;
						const divider = ddcNodes.find((node) => node.id === dividerName);
						if (divider) {
							positionMap.set(divider.id, gridIndex);
							gridIndex++;
						}

						ddcGroups[ddcClass].forEach((book) => {
							positionMap.set(book.id, gridIndex);
							gridIndex++;
						});
					}
				});

			nodes.forEach((node) => {
				const index = positionMap.get(node.id);
				if (index !== undefined) {
					const row = Math.floor(index / rowSize);
					const col = index % rowSize;

					const targetX = col * spacingX - (rowSize * spacingX) / 2 + spacingX / 2;
					const targetY = row * spacingY;
					const targetZ = 0;

					const easing = 0.05;
					node.x = (node.x || 0) + (targetX - (node.x || 0)) * easing;
					node.y = (node.y || 0) + (targetY - (node.y || 0)) * easing;
					node.z = targetZ;

					node.fx = node.x;
					node.fy = node.y;
					node.fz = node.z;

					if (node.__threeObj) {
						node.__threeObj.rotation.set(0, Math.PI / 2, 0);
					}
				}
			});

			ddcNodes.forEach((node) => {
				const index = positionMap.get(node.id);
				if (index !== undefined) {
					const row = Math.floor(index / rowSize);
					const col = index % rowSize;

					const targetX = col * spacingX - (rowSize * spacingX) / 2 + spacingX / 2;
					const targetY = row * spacingY;
					const targetZ = 0;

					const easing = 0.05;
					node.x = (node.x || 0) + (targetX - (node.x || 0)) * easing;
					node.y = (node.y || 0) + (targetY - (node.y || 0)) * easing;
					node.z = targetZ;

					node.fx = node.x;
					node.fy = node.y;
					node.fz = node.z;
				}
			});
		} else {
			nodes.sort((a, b) => {
				if (sortModes[sortIndex] === 'dateacquired') {
					return (
						new Date(b.dateacquired || 0).getTime() - new Date(a.dateacquired || 0).getTime()
					);
				} else if (sortModes[sortIndex] === 'publicationYear') {
					return (b.publicationYear || 0) - (a.publicationYear || 0);
				} else if (sortModes[sortIndex] === 'color') {
					const getHue = (node: Node) => {
						if (!node.averageColor) return 999;
						const rgb = node.averageColor.match(/\d+/g);
						if (!rgb) return 999;
						const r = parseInt(rgb[0]) / 255;
						const g = parseInt(rgb[1]) / 255;
						const blueVal = parseInt(rgb[2]) / 255;
						const max = Math.max(r, g, blueVal);
						const min = Math.min(r, g, blueVal);
						let h = 0;
						if (max !== min) {
							const d = max - min;
							switch (max) {
								case r:
									h = (g - blueVal) / d + (g < blueVal ? 6 : 0);
									break;
								case g:
									h = (blueVal - r) / d + 2;
									break;
								case blueVal:
									h = (r - g) / d + 4;
									break;
							}
							h /= 6;
						}
						return h * 360;
					};
					return getHue(a) - getHue(b);
				}
				return (b.pages || 0) - (a.pages || 0);
			});

			nodes.forEach((node, index) => {
				const row = Math.floor(index / rowSize);
				const col = index % rowSize;

				const targetX = col * spacingX - (rowSize * spacingX) / 2 + spacingX / 2;
				const targetY = row * spacingY;
				const targetZ = 0;

				const easing = 0.05;
				node.x = (node.x || 0) + (targetX - (node.x || 0)) * easing;
				node.y = (node.y || 0) + (targetY - (node.y || 0)) * easing;
				node.z = targetZ;

				node.fx = node.x;
				node.fy = node.y;
				node.fz = node.z;

				if (node.__threeObj) {
					node.__threeObj.rotation.set(0, Math.PI / 2, 0);
				}
			});
		}
	}
</script>

<svelte:head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="X-UA-Compatible" content="ie=edge" />
	<meta property="og:title" content="Casey's Library" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://caseyagollan.com/library/" />
	<meta property="og:image" content="https://caseyagollan.com/library/thumbnail.png" />
	<meta property="og:site_name" content="caseyagollan.com" />
	<meta property="og:locale" content="en_US" />
	<title>Casey's Library</title>
	<link rel="webmention" href="https://webmention.io/caseyagollan.com/webmention" />
</svelte:head>

<div bind:this={graphContainer} class="graph-container"></div>
<Nav currentPage="library" />
<div class="controls">
	<button id="modeToggle" onclick={toggleMode}>{isGridModeActive ? '🕸️' : '📚'}</button>
	<button id="sortToggle" onclick={toggleSort} class:hidden={!isGridModeActive}
		>{sortIcons[sortIndex]}</button
	>
</div>

<style>
	:global(html) {
		background: #808080;
	}
	:global(body) {
		margin: 0;
		background: #808080;
	}

	.graph-container {
		width: 100vw;
		height: 100vh;
	}

	.controls {
		position: fixed;
		top: 5px;
		left: 5px;
		display: flex;
		gap: 5px;
		z-index: 1000;
	}

	.controls button {
		background-color: blue;
		border: none;
		color: white;
		text-align: center;
		text-decoration: none;
		display: block;
		width: auto;
		font-size: 2rem;
		height: auto;
		border-radius: 5px;
		cursor: pointer;
		padding: 0 10px;
		line-height: 1.5;
	}

	.controls button:hover {
		background-color: rgb(73, 73, 255);
	}

	.controls button.hidden {
		display: none;
	}
</style>
