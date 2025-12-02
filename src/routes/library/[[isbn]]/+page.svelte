<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import Nav from '$lib/components/Nav.svelte';

	interface PageData {
		graphData: GraphData | null;
		isbn: string | null;
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

	interface GoogleBookVolumeInfo {
		title?: string;
		subtitle?: string;
		authors?: string[];
		publisher?: string;
		publishedDate?: string;
		description?: string;
		pageCount?: number;
		categories?: string[];
		averageRating?: number;
		ratingsCount?: number;
		imageLinks?: {
			thumbnail?: string;
			smallThumbnail?: string;
		};
		language?: string;
		previewLink?: string;
		infoLink?: string;
	}

	interface GoogleBookData {
		kind: string;
		totalItems: number;
		items?: Array<{
			id: string;
			volumeInfo: GoogleBookVolumeInfo;
		}>;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let THREE: any;

	let { data }: { data: PageData } = $props();

	let graphContainer: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let Graph: any;
	let isLoading = $state(true);
	let loadingProgress = $state('Loading library...');
	let isGridModeActive = $state(false);
	let sortIndex = $state(0);
	const sortModes = ['dateacquired', 'publicationYear', 'ddc', 'color'];
	const sortIcons = ['📅', '⏳', '📖', '🌈'];
	let lastClickedNode: Node | null = null;
	let originalGraphData: GraphData;

	// Book detail overlay state
	let selectedBook: Node | null = $state(null);
	let bookDetails: GoogleBookVolumeInfo | null = $state(null);
	let isLoadingBookDetails = $state(false);
	let bookDetailError: string | null = $state(null);
	let orbitAnimationId: number | null = null;

	// Top-level DDC class names for shelf labels
	const topLevelDdcNames = new Set([
		'Computer science, information & general works',
		'Philosophy & psychology',
		'Religion',
		'Social sciences',
		'Language',
		'Science',
		'Technology',
		'Arts & recreation',
		'Literature',
		'History'
	]);

	// Performance: Cached materials
	let paperWhiteMaterial: THREE.MeshBasicMaterial;
	const textureCache = new Map<string, THREE.Texture>();
	const materialCache = new Map<string, THREE.MeshBasicMaterial>();
	const geometryCache = new Map<string, THREE.BoxGeometry>();

	// Cleanup tracking
	const animationFrameIds = new Set<number>();
	let isDestroyed = false;

	// Mobile detection and limits
	const isMobile = browser && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
	const maxTexturesOnMobile = 100; // Limit textures on mobile to prevent crashes
	let textureCount = 0;

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
		averageColor: string,
		bookHeight?: number
	): THREE.MeshBasicMaterial {
		const cacheKey = `spine_${node.id}_${depth}_${averageColor}_${bookHeight}`;
		if (materialCache.has(cacheKey)) {
			return materialCache.get(cacheKey)!;
		}

		// On mobile, use simple colored material instead of texture if limit reached
		if (isMobile && textureCount >= maxTexturesOnMobile) {
			const simpleMaterial = new THREE.MeshBasicMaterial({ color: averageColor });
			materialCache.set(cacheKey, simpleMaterial);
			return simpleMaterial;
		}

		// Match canvas aspect ratio to actual spine geometry
		// Spine face is (depthVal x height) where depthVal = depth/10
		// Use resolution multiplier for crisp text
		const resolution = 8;
		const spineWidth = Math.max(depth / 10, 0.5); // Match depthVal from createBookObject
		const spineHeight = bookHeight || 25;

		spineCanvas.width = Math.round(spineWidth * resolution * 10);
		spineCanvas.height = Math.round(spineHeight * resolution * 10);

		spineCtx.fillStyle = averageColor;
		spineCtx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

		spineCtx.fillStyle = 'white';
		spineCtx.strokeStyle = 'black';

		// Font size relative to spine width
		const baseFontSize = Math.max(8, Math.min(14, spineCanvas.width * 0.25));
		spineCtx.font = `bold ${baseFontSize}px Arial`;
		spineCtx.textAlign = 'left';
		spineCtx.textBaseline = 'top';

		// Draw text vertically (rotated 90 degrees) - left aligned from top
		const padding = 10;
		const maxTextWidth = spineCanvas.height - padding * 2;

		// Truncate title if too long
		let title = node.id;
		let metrics = spineCtx.measureText(title);
		while (metrics.width > maxTextWidth && title.length > 10) {
			title = title.slice(0, -4) + '…';
			metrics = spineCtx.measureText(title);
		}

		// Draw text rotated 90 degrees (reading from bottom to top)
		spineCtx.save();
		spineCtx.translate(spineCanvas.width / 2 + baseFontSize / 3, spineCanvas.height - padding);
		spineCtx.rotate(-Math.PI / 2);
		spineCtx.lineWidth = 2;
		spineCtx.strokeStyle = 'rgba(0,0,0,0.5)';
		spineCtx.strokeText(title, 0, 0);
		spineCtx.fillText(title, 0, 0);
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
		textureCount++;
		return material;
	}

	// Performance: Create back cover with cached canvas
	function createBackCoverMaterial(averageColor: string): THREE.MeshBasicMaterial {
		const cacheKey = `back_${averageColor}`;
		if (materialCache.has(cacheKey)) {
			return materialCache.get(cacheKey)!;
		}

		// On mobile, use simple colored material instead of texture if limit reached
		if (isMobile && textureCount >= maxTexturesOnMobile) {
			const simpleMaterial = new THREE.MeshBasicMaterial({ color: averageColor });
			materialCache.set(cacheKey, simpleMaterial);
			return simpleMaterial;
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
		textureCount++;
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
		textureCount++;
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

		const hue = Math.abs(titleHash) % 360;
		const randomSeed = Math.abs(titleHash) / 2147483647;
		const bgColor = `hsl(${hue}, 60%, 45%)`;

		if (materialCache.has(cacheKey)) {
			return {
				material: materialCache.get(cacheKey)!,
				width: (120 + randomSeed * 80) / 10,
				height: (180 + randomSeed * 100) / 10,
				averageColor: bgColor
			};
		}

		// On mobile, use simple colored material instead of texture if limit reached
		if (isMobile && textureCount >= maxTexturesOnMobile) {
			const simpleMaterial = new THREE.MeshBasicMaterial({ color: bgColor });
			materialCache.set(cacheKey, simpleMaterial);
			return {
				material: simpleMaterial,
				width: (120 + randomSeed * 80) / 10,
				height: (180 + randomSeed * 100) / 10,
				averageColor: bgColor
			};
		}

		coverCanvas.width = 256;
		coverCanvas.height = 384;

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
		textureCount++;

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
			spineMaterial = createSpineTexture(node, depth, averageColor, height);
		} else {
			const placeholder = createPlaceholderCover(node);
			frontMaterial = placeholder.material;
			width = placeholder.width;
			height = placeholder.height;
			averageColor = placeholder.averageColor;
			spineMaterial = createSpineTexture(node, depth, averageColor, height);
		}

		const depthVal = Math.max(0.1, depth / 10);

		// Cache geometries to reduce memory usage
		const geometryKey = `${width}_${height}_${depthVal}`;
		let geometry: THREE.BoxGeometry;
		if (geometryCache.has(geometryKey)) {
			geometry = geometryCache.get(geometryKey)!;
		} else {
			geometry = new THREE.BoxGeometry(width, height, depthVal);
			geometryCache.set(geometryKey, geometry);
		}

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

	// Fetch book details from Google Books API
	async function fetchBookDetails(isbn: string): Promise<GoogleBookVolumeInfo | null> {
		try {
			const response = await fetch(
				`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
			);
			if (!response.ok) {
				throw new Error('Failed to fetch book details');
			}
			const data: GoogleBookData = await response.json();
			if (data.items && data.items.length > 0) {
				return data.items[0].volumeInfo;
			}
			return null;
		} catch (error) {
			console.error('Error fetching book details:', error);
			return null;
		}
	}

	// Select a book and show its details
	async function selectBook(node: Node, updateUrl = true) {
		if (!Graph) return;

		selectedBook = node;
		bookDetails = null;
		bookDetailError = null;

		// Update URL with ISBN
		if (updateUrl && browser && node.isbn) {
			window.history.replaceState({}, '', `/library/${node.isbn}`);
		}

		// Hide all other books
		const graphData = Graph.graphData();
		graphData.nodes.forEach((n: Node) => {
			if (n.__threeObj) {
				n.__threeObj.visible = n.id === node.id || n.group !== 'book';
			}
		});

		// Start orbit animation around the selected book
		const bookX = node.x || 0;
		const bookY = node.y || 0;
		const bookZ = node.z || 0;
		const orbitRadius = 40;
		const orbitSpeed = 0.0005; // radians per millisecond
		let startTime: number | null = null;

		function orbitCamera(timestamp: number) {
			if (isDestroyed || !selectedBook || selectedBook.id !== node.id) return;
			if (!startTime) startTime = timestamp;

			const elapsed = timestamp - startTime;
			const angle = elapsed * orbitSpeed;

			// Orbit in XZ plane around the book
			const cameraX = bookX + orbitRadius * Math.cos(angle);
			const cameraZ = bookZ + orbitRadius * Math.sin(angle);
			const cameraY = bookY + 10; // Slightly above

			Graph.cameraPosition(
				{ x: cameraX, y: cameraY, z: cameraZ },
				{ x: bookX, y: bookY, z: bookZ },
				0 // Instant update for smooth orbit
			);

			orbitAnimationId = requestAnimationFrame(orbitCamera);
			animationFrameIds.add(orbitAnimationId);
		}

		// Start the orbit with a zoom-in first
		Graph.cameraPosition(
			{ x: bookX + orbitRadius, y: bookY + 10, z: bookZ },
			{ x: bookX, y: bookY, z: bookZ },
			1000
		);

		// Start orbiting after zoom completes
		setTimeout(() => {
			if (selectedBook && selectedBook.id === node.id) {
				orbitAnimationId = requestAnimationFrame(orbitCamera);
				animationFrameIds.add(orbitAnimationId);
			}
		}, 1000);

		// Fetch book details if ISBN is available
		if (node.isbn) {
			isLoadingBookDetails = true;
			const details = await fetchBookDetails(node.isbn);
			if (details) {
				bookDetails = details;
			} else {
				bookDetailError = 'Could not find book details';
			}
			isLoadingBookDetails = false;
		} else {
			bookDetailError = 'No ISBN available for this book';
		}
	}

	// Deselect book and restore view
	function deselectBook() {
		if (!Graph || !selectedBook) return;

		// Stop orbit animation
		if (orbitAnimationId !== null) {
			cancelAnimationFrame(orbitAnimationId);
			animationFrameIds.delete(orbitAnimationId);
			orbitAnimationId = null;
		}

		// Show all books again
		const graphData = Graph.graphData();
		graphData.nodes.forEach((n: Node) => {
			if (n.__threeObj) {
				n.__threeObj.visible = true;
			}
		});

		// Reset camera
		Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);

		// Remove ISBN from URL
		if (browser) {
			window.history.replaceState({}, '', '/library/');
		}

		selectedBook = null;
		bookDetails = null;
		bookDetailError = null;
		lastClickedNode = null;
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

		loadingProgress = 'Unpacking boxes…';

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

		loadingProgress = 'Cataloging collection…';

		// Load graph data - use server-provided data or fetch
		let graphData: GraphData;
		if (data.graphData) {
			graphData = data.graphData;
		} else {
			const response = await fetch('/library/graph.json');
			const rawData = await response.json();
			graphData = expandGraphData(rawData);
		}

		const bookCount = graphData.nodes.filter((n) => n.group === 'book').length;
		loadingProgress = `Organizing ${bookCount} books…`;

		// Allow UI to update before heavy graph creation
		await new Promise((resolve) => requestAnimationFrame(resolve));

		Graph = ForceGraph3D()(graphContainer)
			.graphData(graphData)
			.onNodeClick((node: Node) => {
				if (node.group === 'book') {
					// If a book is already selected
					if (selectedBook) {
						// Tapping the same book deselects it
						if (selectedBook.id === node.id) {
							deselectBook();
						} else {
							// Tapping a different book - deselect first, then select new one
							deselectBook();
							selectBook(node);
						}
					} else {
						// No book selected, select this one
						selectBook(node);
					}
				}
			})
			.onBackgroundClick(() => {
				if (selectedBook) {
					deselectBook();
				} else {
					Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 3000);
					lastClickedNode = null;
				}
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
					// In grid mode, only show top-level DDC category labels
					if (isGridModeActive && !topLevelDdcNames.has(node.id)) {
						// Return invisible placeholder for non-top-level DDC nodes
						const emptyGroup = new THREE.Group();
						return emptyGroup;
					}
					const sprite = new SpriteText(node.id);
					sprite.color = 'blue';
					sprite.textHeight = Math.max((node.points || 1) / 2, 3);
					return sprite;
				}
				return null;
			})
			.backgroundColor('#808080');

		// Configure touch controls for better mobile experience
		const controls = Graph.controls();
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.rotateSpeed = 0.8;
		controls.zoomSpeed = 1.2;
		controls.panSpeed = 0.8;
		// Enable touch gestures: one finger = rotate, two fingers = pan/zoom
		controls.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN
		};

		// Store original data for mode switching
		originalGraphData = { ...Graph.graphData() };

		// Mark loading complete after a short delay to ensure render is visible
		requestAnimationFrame(() => {
			isLoading = false;

			// Check for ISBN from route params and select that book
			if (data.isbn) {
				const bookNode = graphData.nodes.find(
					(n: Node) => n.group === 'book' && n.isbn === data.isbn
				);
				if (bookNode) {
					// Small delay to let the graph render first
					setTimeout(() => selectBook(bookNode, false), 100);
				}
			}
		});
	});

	onDestroy(() => {
		if (!browser) return;

		// Set destroyed flag to stop any ongoing animations
		isDestroyed = true;

		// Cancel all pending animation frames
		animationFrameIds.forEach((id) => cancelAnimationFrame(id));
		animationFrameIds.clear();

		// Dispose of Three.js resources
		// Dispose textures
		textureCache.forEach((texture) => {
			texture.dispose();
		});
		textureCache.clear();

		// Dispose materials
		materialCache.forEach((material) => {
			if (material.map) {
				material.map.dispose();
			}
			material.dispose();
		});
		materialCache.clear();

		// Dispose geometries
		geometryCache.forEach((geometry) => {
			geometry.dispose();
		});
		geometryCache.clear();

		// Dispose paper white material
		if (paperWhiteMaterial) {
			paperWhiteMaterial.dispose();
		}

		// Clean up Graph instance
		if (Graph) {
			// Get all nodes and dispose their 3D objects
			const graphData = Graph.graphData();
			if (graphData && graphData.nodes) {
				graphData.nodes.forEach((node: Node) => {
					if (node.__threeObj) {
						// Dispose geometry
						if (node.__threeObj.geometry) {
							node.__threeObj.geometry.dispose();
						}
						// Dispose materials
						if (Array.isArray(node.__threeObj.material)) {
							node.__threeObj.material.forEach((mat: THREE.Material) => {
								if ('map' in mat && mat.map) {
									mat.map.dispose();
								}
								mat.dispose();
							});
						} else if (node.__threeObj.material) {
							const mat = node.__threeObj.material;
							if ('map' in mat && mat.map) {
								mat.map.dispose();
							}
							mat.dispose();
						}
					}
				});
			}

			// Destroy the graph
			if (Graph._destructor) {
				Graph._destructor();
			}
		}

		// Clear canvas contexts
		if (spineCanvas) {
			spineCanvas.width = 0;
			spineCanvas.height = 0;
		}
		if (coverCanvas) {
			coverCanvas.width = 0;
			coverCanvas.height = 0;
		}

		console.log('Library page cleanup complete');
	});

	function toggleMode() {
		if (!Graph) return;

		isGridModeActive = !isGridModeActive;

		if (isGridModeActive) {
			// Store original data before switching to grid mode
			// Use a lighter-weight copy that preserves node references but copies structure
			const currentData = Graph.graphData();
			// Store links with string IDs (before graph mutates them to object references)
			originalGraphData = {
				nodes: currentData.nodes.map((n: Node) => ({ ...n })),
				links: currentData.links.map((l: Link) => ({
					source: typeof l.source === 'object' ? (l.source as Node).id : l.source,
					target: typeof l.target === 'object' ? (l.target as Node).id : l.target
				}))
			};

			Graph.d3Force('custom', customForce);
			Graph.numDimensions(2);

			let filteredNodes: Node[];
			if (sortModes[sortIndex] === 'ddc') {
				// In DDC mode, only include books and top-level DDC categories
				filteredNodes = currentData.nodes.filter(
					(node: Node) =>
						node.group === 'book' ||
						(node.group === 'ddc' && topLevelDdcNames.has(node.id))
				);
			} else {
				filteredNodes = currentData.nodes.filter((node: Node) => node.group !== 'ddc');
			}

			// Rotate books to shelf orientation
			for (let i = 0; i < filteredNodes.length; i++) {
				const node = filteredNodes[i];
				if (node.group === 'book' && node.__threeObj) {
					node.__threeObj.rotation.set(0, Math.PI / 2, 0);
				}
			}

			Graph.graphData({ nodes: filteredNodes, links: [] });

			// Enable panning for easier shelf navigation
			const controls = Graph.controls();
			controls.enablePan = true;
			controls.minPolarAngle = Math.PI / 4;
			controls.maxPolarAngle = (3 * Math.PI) / 4;
			controls.enableZoom = true;
			controls.enableRotate = true;
			// In shelf mode: one finger = pan, two fingers = zoom
			controls.touches = {
				ONE: THREE.TOUCH.PAN,
				TWO: THREE.TOUCH.DOLLY_ROTATE
			};
		} else {
			Graph.d3Force('custom', null);
			Graph.numDimensions(3);

			// Restore all original nodes and links
			// Build a map for faster lookups instead of using .find() in a loop
			const currentNodes = Graph.graphData().nodes;
			const currentNodeMap = new Map<string, Node>();
			for (let i = 0; i < currentNodes.length; i++) {
				currentNodeMap.set(currentNodes[i].id, currentNodes[i]);
			}

			const restoredNodes: Node[] = [];
			for (let i = 0; i < originalGraphData.nodes.length; i++) {
				const origNode = originalGraphData.nodes[i];
				const currentNode = currentNodeMap.get(origNode.id);
				restoredNodes.push({
					...origNode,
					x: currentNode?.x ?? origNode.x,
					y: currentNode?.y ?? origNode.y,
					z: currentNode?.z ?? 0,
					// Clear fixed positions to allow force simulation
					fx: undefined,
					fy: undefined,
					fz: undefined
				});
			}

			Graph.graphData({ nodes: restoredNodes, links: originalGraphData.links });

			// Re-enable full 3D controls
			const controls = Graph.controls();
			controls.enablePan = true;
			controls.minPolarAngle = 0;
			controls.maxPolarAngle = Math.PI;
			controls.enableZoom = true;
			controls.enableRotate = true;
			// In graph mode: one finger = rotate, two fingers = pan/zoom
			controls.touches = {
				ONE: THREE.TOUCH.ROTATE,
				TWO: THREE.TOUCH.DOLLY_PAN
			};

			// Reheat the force simulation to animate nodes back to graph layout
			Graph.d3ReheatSimulation();

			// Skip rotation animations on mobile to prevent crashes
			if (!isMobile) {
				// Animate book rotations on desktop only
				for (let i = 0; i < restoredNodes.length; i++) {
					const node = restoredNodes[i];
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
							if (isDestroyed) return;
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
								const frameId = requestAnimationFrame(animateRotation);
								animationFrameIds.add(frameId);
							}
						}

						const initialFrameId = requestAnimationFrame(animateRotation);
						animationFrameIds.add(initialFrameId);
					}
				}
			} else {
				// On mobile, just set random rotations immediately without animation
				for (let i = 0; i < restoredNodes.length; i++) {
					const node = restoredNodes[i];
					if (node.group === 'book' && node.__threeObj) {
						node.__threeObj.rotation.set(
							Math.random() * 2 * Math.PI,
							Math.random() * 2 * Math.PI,
							Math.random() * 2 * Math.PI
						);
					}
				}
			}
		}
	}

	function toggleSort() {
		if (!Graph || !isGridModeActive) return;

		sortIndex = (sortIndex + 1) % sortModes.length;

		let filteredNodes: Node[];
		if (sortModes[sortIndex] === 'ddc') {
			// In DDC mode, only include books and top-level DDC categories
			filteredNodes = originalGraphData.nodes.filter(
				(node: Node) =>
					node.group === 'book' ||
					(node.group === 'ddc' && topLevelDdcNames.has(node.id))
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
			(node: Node) => node.group === 'ddc' && topLevelDdcNames.has(node.id)
		) as Node[];

		Graph.graphData().nodes.forEach((node: Node) => {
			if (node.fx !== undefined) delete node.fx;
			if (node.fy !== undefined) delete node.fy;
			if (node.fz !== undefined) delete node.fz;
		});

		const booksPerShelf = 50; // Max books per shelf row
		// Use actual book dimensions for spacing calculations
		// When books are rotated to show spines, depth becomes the horizontal spacing
		const sampleBook = nodes.find((n) => n.__threeObj);
		const bookDepth = sampleBook?.__threeObj?.geometry?.parameters?.depth || 2;
		const bookHeight = sampleBook?.__threeObj?.geometry?.parameters?.height || 25;
		const spacingX = bookDepth + 0.5; // Small gap between book spines
		const shelfHeight = bookHeight + 5; // Spacing between shelves (rows)
		const shelfWidth = booksPerShelf * spacingX;
		const shelfStartX = -shelfWidth / 2; // Left edge of shelf
		const labelOffsetX = shelfStartX - 50; // Position for DDC label (left of shelf)

		if (sortModes[sortIndex] === 'ddc') {
			nodes.sort((a, b) => (a.ddcCode || '').localeCompare(b.ddcCode || ''));

			// Group books by top-level DDC class (first digit + "00")
			const ddcGroups: Record<string, Node[]> = {};
			nodes.forEach((node) => {
				const ddcCode = node.ddcCode || '';
				const topLevelClass = ddcCode.length > 0 ? ddcCode.charAt(0) + '00' : '000';
				if (!ddcGroups[topLevelClass]) {
					ddcGroups[topLevelClass] = [];
				}
				ddcGroups[topLevelClass].push(node);
			});

			// DDC class names matching actual graph data node IDs
			const ddcClassNames: Record<string, string> = {
				'000': 'Computer science, information & general works',
				'100': 'Philosophy & psychology',
				'200': 'Religion',
				'300': 'Social sciences',
				'400': 'Language',
				'500': 'Science',
				'600': 'Technology',
				'700': 'Arts & recreation',
				'800': 'Literature',
				'900': 'History'
			};

			let currentShelfRow = 0;
			const easing = 0.05;

			// Position each DDC category on its own shelf
			Object.keys(ddcGroups)
				.sort()
				.forEach((ddcClass) => {
					const booksInCategory = ddcGroups[ddcClass];
					if (booksInCategory.length === 0) return;

					const dividerName = ddcClassNames[ddcClass] || `DDC ${ddcClass}`;
					const divider = ddcNodes.find((node) => node.id === dividerName);

					// Calculate how many rows this category needs
					const rowsNeeded = Math.ceil(booksInCategory.length / booksPerShelf);

					// Position the DDC label at the start of this category's shelves
					if (divider) {
						const targetX = labelOffsetX;
						const targetY = currentShelfRow * shelfHeight;
						const targetZ = 5; // Slightly in front of books

						// Snap labels to position quickly
						divider.x = targetX;
						divider.y = targetY;
						divider.z = targetZ;

						divider.fx = targetX;
						divider.fy = targetY;
						divider.fz = targetZ;
					}

					// Position books on shelves for this category
					booksInCategory.forEach((book, idx) => {
						const rowWithinCategory = Math.floor(idx / booksPerShelf);
						const colWithinRow = idx % booksPerShelf;

						const targetX = shelfStartX + colWithinRow * spacingX + spacingX / 2;
						const targetY = (currentShelfRow + rowWithinCategory) * shelfHeight;
						const targetZ = 0;

						book.x = (book.x || 0) + (targetX - (book.x || 0)) * easing;
						book.y = (book.y || 0) + (targetY - (book.y || 0)) * easing;
						book.z = targetZ;

						book.fx = book.x;
						book.fy = book.y;
						book.fz = book.z;

						if (book.__threeObj) {
							book.__threeObj.rotation.set(0, Math.PI / 2, 0);
						}
					});

					// Move to next category's shelf rows
					currentShelfRow += rowsNeeded;
				});
		} else {
			// Non-DDC sort modes: simple grid layout
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

			const easing = 0.05;
			nodes.forEach((node, index) => {
				const row = Math.floor(index / booksPerShelf);
				const col = index % booksPerShelf;

				const targetX = shelfStartX + col * spacingX + spacingX / 2;
				const targetY = row * shelfHeight;
				const targetZ = 0;

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

{#if isLoading}
	<div class="loading-overlay">
		<div class="loading-content">
			<span class="loading-shapes">
				<svg width="24" height="24" viewBox="-6 -6 12 12">
					<circle r="4" fill="white" class="shape shape-circle" />
					<polygon points="0,-5 1.2,-1.6 5,-1.6 2,0.8 3.2,5 0,2.4 -3.2,5 -2,0.8 -5,-1.6 -1.2,-1.6" fill="white" class="shape shape-star" />
					<polygon points="0,-5 5,4 -5,4" fill="white" class="shape shape-triangle" />
					<rect x="-3" y="-3" width="6" height="6" transform="rotate(45)" fill="white" class="shape shape-square" />
				</svg>
			</span>
			<p class="shimmer-text">
				{#each loadingProgress.split('') as letter, i}
					<span class="shimmer-letter" style="animation-delay: {i * 0.03}s">{letter === ' ' ? '\u00A0' : letter}</span>
				{/each}
			</p>
		</div>
	</div>
{/if}
<div bind:this={graphContainer} class="graph-container"></div>
<Nav currentPage="library" />
<div class="controls" class:hidden={isLoading}>
	<button id="modeToggle" onclick={toggleMode}>{isGridModeActive ? '🕸️' : '📚'}</button>
	<button id="sortToggle" onclick={toggleSort} class:hidden={!isGridModeActive}
		>{sortIcons[sortIndex]}</button
	>
</div>

{#if selectedBook}
	<aside class="book-sidebar" role="complementary" aria-label="Book details">
		<button class="close-button" onclick={deselectBook} aria-label="Close">×</button>

		<h2 class="book-title">{selectedBook.id}</h2>

		{#if isLoadingBookDetails}
			<div class="loading-details">
				<span class="loading-shapes">
					<svg width="24" height="24" viewBox="-6 -6 12 12">
						<circle r="4" fill="currentColor" class="shape shape-circle" />
						<polygon points="0,-5 1.2,-1.6 5,-1.6 2,0.8 3.2,5 0,2.4 -3.2,5 -2,0.8 -5,-1.6 -1.2,-1.6" fill="currentColor" class="shape shape-star" />
						<polygon points="0,-5 5,4 -5,4" fill="currentColor" class="shape shape-triangle" />
						<rect x="-3" y="-3" width="6" height="6" transform="rotate(45)" fill="currentColor" class="shape shape-square" />
					</svg>
				</span>
				<p>Loading book details…</p>
			</div>
		{:else if bookDetailError}
			<div class="error-details">
				<p>{bookDetailError}</p>
				{#if selectedBook.workcode}
					<a href="https://librarything.com/work/{selectedBook.workcode}" target="_blank" rel="noopener noreferrer">
						View on LibraryThing →
					</a>
				{/if}
			</div>
		{:else if bookDetails}
			<div class="book-details">
				{#if bookDetails.subtitle}
					<p class="book-subtitle">{bookDetails.subtitle}</p>
				{/if}

				{#if bookDetails.authors && bookDetails.authors.length > 0}
					<p class="book-authors">{bookDetails.authors.join(', ')}</p>
				{/if}

				<div class="book-meta">
					{#if bookDetails.publishedDate}
						<span class="meta-item">{bookDetails.publishedDate}</span>
					{/if}
					{#if bookDetails.pageCount}
						<span class="meta-item">{bookDetails.pageCount} pages</span>
					{/if}
					{#if bookDetails.publisher}
						<span class="meta-item">{bookDetails.publisher}</span>
					{/if}
				</div>

				{#if bookDetails.categories && bookDetails.categories.length > 0}
					<div class="book-categories">
						{#each bookDetails.categories as category}
							<span class="category-tag">{category}</span>
						{/each}
					</div>
				{/if}

				{#if bookDetails.averageRating}
					<div class="book-rating">
						<span class="stars">{'★'.repeat(Math.round(bookDetails.averageRating))}{'☆'.repeat(5 - Math.round(bookDetails.averageRating))}</span>
						<span class="rating-count">({bookDetails.ratingsCount || 0})</span>
					</div>
				{/if}

				{#if bookDetails.description}
					<p class="book-description">{@html bookDetails.description}</p>
				{/if}

				<div class="book-links">
					{#if bookDetails.previewLink}
						<a href={bookDetails.previewLink} target="_blank" rel="noopener noreferrer" class="book-link">
							Google Books →
						</a>
					{/if}
					{#if selectedBook.workcode}
						<a href="https://librarything.com/work/{selectedBook.workcode}" target="_blank" rel="noopener noreferrer" class="book-link">
							LibraryThing →
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</aside>
{/if}

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

	.controls button.hidden,
	.controls.hidden {
		display: none;
	}

	.loading-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: #808080;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.loading-content {
		text-align: center;
		color: white;
		font-family: system-ui, -apple-system, sans-serif;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.loading-shapes {
		display: inline-block;
		animation: shape-rotate 3s linear infinite;
	}

	.loading-shapes svg {
		display: block;
	}

	@keyframes shape-rotate {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* Hide all shapes except one that morphs */
	.loading-shapes .shape {
		opacity: 0;
	}

	.loading-shapes .shape-circle {
		animation: shape-morph 2s ease-in-out infinite;
		animation-delay: 0s;
	}

	.loading-shapes .shape-star {
		animation: shape-morph 2s ease-in-out infinite;
		animation-delay: 0.5s;
	}

	.loading-shapes .shape-triangle {
		animation: shape-morph 2s ease-in-out infinite;
		animation-delay: 1s;
	}

	.loading-shapes .shape-square {
		animation: shape-morph 2s ease-in-out infinite;
		animation-delay: 1.5s;
	}

	@keyframes shape-morph {
		0%, 20% { opacity: 1; }
		25%, 100% { opacity: 0; }
	}

	.shimmer-text {
		font-style: italic;
		font-size: 1.2rem;
		margin: 0;
	}

	.shimmer-letter {
		display: inline-block;
		animation: letter-wave 2s ease-in-out infinite;
	}

	@keyframes letter-wave {
		0%, 100% { opacity: 0.3; transform: translateY(0); }
		50% { opacity: 1; transform: translateY(-2px); }
	}

	/* Book Detail Sidebar */
	.book-sidebar {
		position: fixed;
		top: 0;
		right: 0;
		width: 320px;
		height: 100vh;
		background: #808080;
		z-index: 1500;
		padding: 20px;
		box-sizing: border-box;
		overflow-y: auto;
		font-family: system-ui, -apple-system, sans-serif;
		color: white;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.close-button {
		position: absolute;
		top: 12px;
		right: 12px;
		background: blue;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: white;
		line-height: 1;
		padding: 4px 10px;
		border-radius: 5px;
	}

	.close-button:hover {
		background: rgb(73, 73, 255);
	}

	.book-title {
		font-size: 1.25rem;
		font-weight: bold;
		margin: 0 0 8px 0;
		padding-right: 50px;
		color: white;
		line-height: 1.3;
	}

	.book-subtitle {
		font-size: 0.95rem;
		color: rgba(255, 255, 255, 0.8);
		margin: 0 0 8px 0;
		font-style: italic;
	}

	.book-authors {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.9);
		margin: 0 0 16px 0;
	}

	.book-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 16px;
	}

	.meta-item {
		font-size: 0.75rem;
		color: white;
		padding: 3px 8px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.book-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 16px;
	}

	.category-tag {
		font-size: 0.7rem;
		color: white;
		background: blue;
		padding: 3px 8px;
		border-radius: 10px;
	}

	.book-rating {
		margin-bottom: 16px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.stars {
		color: gold;
		font-size: 1rem;
		letter-spacing: 1px;
	}

	.rating-count {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.book-description {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.9);
		line-height: 1.5;
		margin-bottom: 16px;
		max-height: none;
	}

	.book-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}

	.book-link {
		display: inline-block;
		color: white;
		background: blue;
		text-decoration: none;
		font-size: 0.85rem;
		padding: 6px 12px;
		border-radius: 5px;
	}

	.book-link:hover {
		background: rgb(73, 73, 255);
	}

	.loading-details,
	.error-details {
		text-align: center;
		padding: 24px 0;
		color: rgba(255, 255, 255, 0.8);
	}

	.loading-details .loading-shapes {
		color: white;
	}

	.error-details a {
		color: white;
		background: blue;
		text-decoration: none;
		padding: 6px 12px;
		border-radius: 5px;
		display: inline-block;
		margin-top: 8px;
	}

	.error-details a:hover {
		background: rgb(73, 73, 255);
	}

	/* Mobile adjustments for sidebar */
	@media (max-width: 600px) {
		.book-sidebar {
			width: 100%;
			height: auto;
			max-height: 50vh;
			top: auto;
			bottom: 0;
			border-radius: 12px 12px 0 0;
			animation: slideUp 0.3s ease-out;
		}

		@keyframes slideUp {
			from {
				transform: translateY(100%);
				opacity: 0;
			}
			to {
				transform: translateY(0);
				opacity: 1;
			}
		}

		.book-title {
			font-size: 1.1rem;
		}
	}
</style>
