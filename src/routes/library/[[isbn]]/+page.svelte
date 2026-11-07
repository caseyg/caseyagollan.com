<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type * as Three from 'three';
	import { browser } from '$app/environment';
	import { pushState, replaceState } from '$app/navigation';
	import { librarySortModes, libraryShelfYear, libraryShelfDate, readLibraryView, writeLibraryView } from '$lib/library-view';
	import Nav from '$lib/components/Nav.svelte';
	import { spineTextureSize } from '$lib/library/textures';
	import { colorSortKey, compareColorKeys, placeholderColor, spineColor } from '$lib/library-color';
	import { layoutSpine } from '$lib/library-spine';
	import { libraryText } from '$lib/library-text';
	import { shelfCoverCamera, adjacentShelfBook } from '$lib/library-selection';
	import { shelfCameraFrame, clampShelfTarget, type ShelfBounds } from '$lib/library-camera';

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
		authorLastName?: string;
		authorName?: string;
		pages?: number;
		dateacquired?: string;
		entrydate?: string;
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
		__threeObj?: Three.Mesh<Three.BoxGeometry, Three.MeshBasicMaterial | Three.MeshBasicMaterial[]>;
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
	const sortModes = librarySortModes;
	const sortLabels = ['Recently acquired', 'Publication year', 'Subject', 'Color'];
	const sortIcons = ['📅', '⏳', '📖', '🌈'];
	let lastClickedNode: Node | null = null;
	let originalGraphData: GraphData;
	let shelfFramePending = false;
	let shelfBounds: ShelfBounds | null = null;
	let shelfFramingUntil = 0;
	interface BookPose { x: number; y: number; z: number; rotationY: number }
	const shelfBookPresentations = new Map<string, { node: Node; pose: BookPose; frame: number | null; open: boolean }>();
	let shelfSavedCamera: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; minDistance: number; maxDistance: number } | null = null;
	let shelfCameraAnimation: number | null = null;
	const shelfDraggedPositions = new Map<string, { x: number; y: number }>();

	// Book detail overlay state
	let selectedBook: Node | null = $state.raw(null);
	let bookDetails: GoogleBookVolumeInfo | null = $state(null);
	let isLoadingBookDetails = $state(false);
	let detailsRequest: AbortController | null = null;
	let orbitAnimationId: number | null = null;
	let orbitPaused = false;
	let removeOrbitListener: (() => void) | undefined;
	let orbitStartTimeoutId: ReturnType<typeof setTimeout> | undefined;
	let initialSelectionTimeoutId: ReturnType<typeof setTimeout> | undefined;
	let orbitResumeTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let orbitDirection = 1; // 1 or -1 for clockwise/counter-clockwise

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
	let paperWhiteMaterial: Three.MeshBasicMaterial;
	const textureCache = new Map<string, Three.Texture>();
	const materialCache = new Map<string, Three.MeshBasicMaterial>();
	const geometryCache = new Map<string, Three.BoxGeometry>();

	// Cleanup tracking
	const animationFrameIds = new Set<number>();
	function scheduleFrame(callback: FrameRequestCallback) {
		const id = requestAnimationFrame((time) => {
			animationFrameIds.delete(id);
			if (!isDestroyed) callback(time);
		});
		animationFrameIds.add(id);
		return id;
	}
	let isDestroyed = false;

	// Mobile detection and limits
	const isMobile = browser && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
	// Reserve capacity for real covers even when placeholders appear first.
	const maxCoverTexturesOnMobile = 64;
	const maxGeneratedTexturesOnMobile = 36;
	let textureCount = 0;
	let coverTextureCount = 0;

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
	): Three.MeshBasicMaterial {
		const cacheKey = `spine_${node.id}_${node.authorLastName || ""}_${depth}_${averageColor}_${bookHeight}`;
		if (materialCache.has(cacheKey)) {
			return materialCache.get(cacheKey)!;
		}

		// Size lettering in texture pixels, proportional to the physical spine width.
		// A fixed 14px font became microscopic on a canvas thousands of pixels tall.
		const spineWidth = Math.max(depth / 10, 0.1);
		const spineHeight = bookHeight || 25;
		const size = spineTextureSize(spineWidth, spineHeight);
		spineCanvas.width = size.width;
		spineCanvas.height = size.height;
		spineCtx.fillStyle = averageColor;
		spineCtx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

		const color = new THREE.Color(averageColor);
		const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
		spineCtx.fillStyle = luminance > 0.18 ? '#111111' : '#ffffff';
		const layout = layoutSpine(libraryText(node.id), libraryText(node.authorLastName || ''), spineCanvas.height, spineCanvas.width,
			(text, size) => {
				spineCtx.font = `600 ${size}px Arial`;
				return spineCtx.measureText(text).width;
			});
		spineCtx.save();
		spineCtx.translate(spineCanvas.width / 2, spineCanvas.height / 2);
		spineCtx.rotate(-Math.PI / 2);
		spineCtx.textAlign = 'left';
		spineCtx.textBaseline = 'middle';
		spineCtx.font = `600 ${layout.titleSize}px Arial`;
		layout.lines.forEach((line, index) => {
			const y = (index - (layout.lines.length - 1) / 2) * layout.titleSize * 1.2;
			spineCtx.fillText(line, -spineCanvas.height / 2 + layout.padding, y);
		});
		if (layout.author) {
			spineCtx.textAlign = 'right';
			spineCtx.font = `600 ${layout.authorSize}px Arial`;
			spineCtx.fillText(layout.author, spineCanvas.height / 2 - layout.padding, 0);
		}
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
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.generateMipmaps = true;
		texture.minFilter = THREE.LinearMipmapLinearFilter;
		texture.magFilter = THREE.LinearFilter;

		const material = new THREE.MeshBasicMaterial({ map: texture });
		materialCache.set(cacheKey, material);
		textureCount++;
		return material;
	}

	// Reuse plain materials for solid-color book backs
	function createBackCoverMaterial(averageColor: string): Three.MeshBasicMaterial {
		const cacheKey = `back_${averageColor}`;
		if (materialCache.has(cacheKey)) {
			return materialCache.get(cacheKey)!;
		}

		// A solid-color back needs no canvas, pixel buffer, or GPU texture.
		const material = new THREE.MeshBasicMaterial({ color: averageColor });
		materialCache.set(cacheKey, material);
		return material;
	}

	// Performance: Load texture with caching
	function loadTexture(url: string): Three.Texture {
		if (textureCache.has(url)) {
			return textureCache.get(url)!;
		}

		const loader = new THREE.TextureLoader();
		const texture = loader.load(url);
		textureCache.set(url, texture);
		coverTextureCount++;
		return texture;
	}

	// Performance: Create placeholder cover for books without images
	function createPlaceholderCover(node: Node): {
		material: Three.MeshBasicMaterial;
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
		const bgColor = placeholderColor(node.id);

		if (materialCache.has(cacheKey)) {
			return {
				material: materialCache.get(cacheKey)!,
				width: (120 + randomSeed * 80) / 10,
				height: (180 + randomSeed * 100) / 10,
				averageColor: bgColor
			};
		}

		// On mobile, use simple colored material instead of texture if limit reached
		if (isMobile && textureCount >= maxGeneratedTexturesOnMobile) {
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

		const words = libraryText(node.id).split(' ');
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
	function createBookObject(node: Node): Three.Mesh<Three.BoxGeometry, Three.MeshBasicMaterial | Three.MeshBasicMaterial[]> {
		const depth = node.pages ? Math.max(1, Math.ceil(node.pages / 10)) : 20;
		let frontMaterial: Three.MeshBasicMaterial;
		let spineMaterial: Three.MeshBasicMaterial;
		let width: number;
		let height: number;
		let averageColor = spineColor(node);

		if (node.img && node.w && node.h && !isNaN(node.w) && !isNaN(node.h)) {
			const cacheKey = `front_${node.img}`;
			if (!materialCache.has(cacheKey)) {
				const map = !isMobile || coverTextureCount < maxCoverTexturesOnMobile
					? loadTexture('/library/' + node.img)
					: null;
				materialCache.set(cacheKey, new THREE.MeshBasicMaterial(
					map ? { map } : { color: averageColor }
				));
			}
			frontMaterial = materialCache.get(cacheKey)!;
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
		let geometry: Three.BoxGeometry;
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
	async function fetchBookDetails(
		isbn: string | undefined,
		title: string,
		signal: AbortSignal
	): Promise<GoogleBookVolumeInfo | null> {
		try {
			// Try ISBN first if available
			if (isbn) {
				const response = await fetch(
					`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`, { signal }
				);
				if (response.status === 429 || response.status === 403) return null;
				if (response.ok) {
					const data: GoogleBookData = await response.json();
					if (data.items && data.items.length > 0) {
						return data.items[0].volumeInfo;
					}
				}
			}

			// Fall back to title search (quoted for exact match)
			const titleQuery = encodeURIComponent(`"${title}"`);
			const titleResponse = await fetch(
				`https://www.googleapis.com/books/v1/volumes?q=${titleQuery}`, { signal }
			);
			if (titleResponse.ok) {
				const titleData: GoogleBookData = await titleResponse.json();
				if (titleData.items && titleData.items.length > 0) {
					return titleData.items[0].volumeInfo;
				}
			}

			return null;
		} catch (error) {
			if (!signal.aborted) console.warn('Book enrichment unavailable');
			return null;
		}
	}

	function stopShelfCameraAnimation() {
		if (shelfCameraAnimation !== null) {
			cancelAnimationFrame(shelfCameraAnimation);
			animationFrameIds.delete(shelfCameraAnimation);
			shelfCameraAnimation = null;
		}
	}

	function clearShelfPresentations() {
		stopShelfCameraAnimation();
		for (const state of shelfBookPresentations.values()) {
			if (state.frame !== null) { cancelAnimationFrame(state.frame); animationFrameIds.delete(state.frame); }
			state.node.__threeObj?.position.set(state.node.x || 0, state.node.y || 0, 0);
			state.node.__threeObj?.rotation.set(0, Math.PI / 2, 0);
		}
		shelfBookPresentations.clear();
		shelfSavedCamera = null;
	}

	function animateShelfCamera(position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) {
		stopShelfCameraAnimation();
		const startPosition = { ...Graph.camera().position };
		const startTarget = { ...Graph.controls().target };
		const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
		const started = performance.now();
		shelfFramingUntil = started + duration + 50;
		function step(now: number) {
			if (shelfCameraAnimation !== null) animationFrameIds.delete(shelfCameraAnimation);
			if (isDestroyed) return;
			const progress = duration ? Math.min((now - started) / duration, 1) : 1;
			const t = 1 - Math.pow(1 - progress, 3);
			const blend = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => ({
				x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t
			});
			Graph.cameraPosition(blend(startPosition, position), blend(startTarget, target), 0);
			shelfCameraAnimation = progress < 1 ? requestAnimationFrame(step) : null;
			if (shelfCameraAnimation !== null) animationFrameIds.add(shelfCameraAnimation);
		}
		shelfCameraAnimation = requestAnimationFrame(step);
		animationFrameIds.add(shelfCameraAnimation);
	}

	function animateShelfBook(node: Node, open: boolean) {
		const book = node.__threeObj;
		if (!book) return;
		const previous = shelfBookPresentations.get(node.id);
		if (previous?.frame != null) {
			cancelAnimationFrame(previous.frame);
			animationFrameIds.delete(previous.frame);
		}
		const from: BookPose = { x: book.position.x, y: book.position.y, z: book.position.z, rotationY: book.rotation.y };
		const pullDistance = Math.max(book.geometry.parameters.width, book.geometry.parameters.height) * 1.4;
		const to: BookPose = { x: node.x || 0, y: node.y || 0, z: open ? pullDistance : 0, rotationY: open ? 0 : Math.PI / 2 };
		const state = { node, pose: { ...from }, frame: null as number | null, open };
		shelfBookPresentations.set(node.id, state);
		const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
		const started = performance.now();
		const step = (now: number) => {
			if (state.frame !== null) animationFrameIds.delete(state.frame);
			if (isDestroyed) return;
			const progress = duration ? Math.min((now - started) / duration, 1) : 1;
			const t = 1 - Math.pow(1 - progress, 3);
			state.pose = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
				z: from.z + (to.z - from.z) * t, rotationY: from.rotationY + (to.rotationY - from.rotationY) * t };
			book.position.set(state.pose.x, state.pose.y, state.pose.z);
			book.rotation.set(0, state.pose.rotationY, 0);
			state.frame = progress < 1 ? requestAnimationFrame(step) : null;
			if (state.frame !== null) animationFrameIds.add(state.frame);
			else if (!open) shelfBookPresentations.delete(node.id);
		};
		state.frame = requestAnimationFrame(step);
		animationFrameIds.add(state.frame);
		if (open) {
			const view = shelfCoverCamera({ ...to, width: book.geometry.parameters.width, height: book.geometry.parameters.height },
				{ width: graphContainer.clientWidth, height: graphContainer.clientHeight }, Graph.camera().fov);
			animateShelfCamera(view.position, view.target);
		}
	}

	function presentShelfBook(node: Node) {
		if (!shelfSavedCamera) shelfSavedCamera = { position: { ...Graph.camera().position }, target: { ...Graph.controls().target },
			minDistance: Graph.controls().minDistance, maxDistance: Graph.controls().maxDistance };
		for (const state of shelfBookPresentations.values()) if (state.open && state.node.id !== node.id) animateShelfBook(state.node, false);
		animateShelfBook(node, true);
	}

	// Select a book and show its details
	async function selectBook(node: Node, updateUrl = true) {
		if (!Graph) return;

		detailsRequest?.abort();
		const request = new AbortController();
		detailsRequest = request;
		selectedBook = node;
		if (isGridModeActive) presentShelfBook(node);
		Graph.controls().minDistance = 0.1;
		Graph.controls().maxDistance = Infinity;
		const catalogDetails: GoogleBookVolumeInfo = {
			title: libraryText(node.id),
			authors: node.authorName ? [libraryText(node.authorName)] : undefined,
			publishedDate: node.publicationYear ? String(node.publicationYear) : undefined,
			pageCount: node.pages
		};
		bookDetails = catalogDetails;

		// Update URL with ISBN
		if (updateUrl && browser && node.isbn) {
			const url = new URL(window.location.href);
			url.pathname = `/library/${encodeURIComponent(node.isbn)}`;
			replaceState(url, {});
		}

		// Fade other books to 25% opacity
		const graphData = Graph.graphData();
		graphData.nodes.forEach((n: Node) => {
			if (n.__threeObj && n.group === 'book') {
				const isSelected = n.id === node.id;
				const materials = Array.isArray(n.__threeObj.material)
					? n.__threeObj.material
					: [n.__threeObj.material];
				materials.forEach((mat: Three.Material) => {
					if ('opacity' in mat) {
						mat.transparent = true;
						mat.opacity = isSelected ? 1.0 : 0.25;
					}
				});
			}
		});

		if (!isGridModeActive) {
			// Start orbit animation around the selected book
			const bookX = node.x || 0;
			const bookY = node.y || 0;
			const bookZ = node.z || 0;
			const orbitRadius = 40;
			const orbitSpeed = 0.0003; // radians per millisecond
			let startTime: number | null = null;

			// Random orbit direction each time
			orbitDirection = Math.random() > 0.5 ? 1 : -1;
			orbitPaused = false;

			// Clear any existing resume timeout
			if (orbitResumeTimeoutId) {
				clearTimeout(orbitResumeTimeoutId);
				orbitResumeTimeoutId = null;
			}

			function orbitCamera(timestamp: number) {
				if (isDestroyed || !selectedBook || selectedBook.id !== node.id) return;

				// Skip position update if paused, but keep animation frame running
				if (orbitPaused) {
					orbitAnimationId = scheduleFrame(orbitCamera);
					return;
				}

				if (!startTime) startTime = timestamp;

				const elapsed = timestamp - startTime;
				const angle = elapsed * orbitSpeed * orbitDirection;

				// Orbit in XZ plane around the book
				const cameraX = bookX + orbitRadius * Math.cos(angle);
				const cameraZ = bookZ + orbitRadius * Math.sin(angle);
				const cameraY = bookY + 10; // Slightly above

				Graph.cameraPosition(
					{ x: cameraX, y: cameraY, z: cameraZ },
					{ x: bookX, y: bookY, z: bookZ },
					0 // Instant update for smooth orbit
				);

				orbitAnimationId = scheduleFrame(orbitCamera);
			}

			// Start the orbit with a zoom-in first
			Graph.cameraPosition(
				{ x: bookX + orbitRadius, y: bookY + 10, z: bookZ },
				{ x: bookX, y: bookY, z: bookZ },
				1000
			);

			// Set up pause on user interaction
			const controls = Graph.controls();
			const pauseOrbit = () => {
				if (!selectedBook) return;
				orbitPaused = true;

				// Clear existing timeout
				if (orbitResumeTimeoutId) {
					clearTimeout(orbitResumeTimeoutId);
				}

				// Resume after 5 seconds of inactivity
				orbitResumeTimeoutId = setTimeout(() => {
					if (selectedBook) {
						orbitPaused = false;
						startTime = null; // Reset start time so orbit continues smoothly
					}
				}, 5000);
			};

			// Listen for user interaction
			removeOrbitListener?.();
			controls.addEventListener('start', pauseOrbit);
			removeOrbitListener = () => controls.removeEventListener('start', pauseOrbit);

			// Start orbiting after zoom completes
			clearTimeout(orbitStartTimeoutId);
			orbitStartTimeoutId = setTimeout(() => {
				if (!isDestroyed && selectedBook === node) {
					orbitAnimationId = scheduleFrame(orbitCamera);
				}
			}, 1000);

		}

		// Catalog metadata is available immediately; Google Books only enriches it.
		isLoadingBookDetails = true;
		const timeout = setTimeout(() => request.abort(), 6000);
		const details = await fetchBookDetails(node.isbn, libraryText(node.id), request.signal);
		clearTimeout(timeout);
		if (detailsRequest !== request || selectedBook?.id !== node.id) return;
		if (details) bookDetails = { ...details, ...catalogDetails,
			authors: catalogDetails.authors || details.authors,
			publishedDate: catalogDetails.publishedDate || details.publishedDate,
			pageCount: catalogDetails.pageCount || details.pageCount };
		isLoadingBookDetails = false;
	}

	// Navigate to next/previous book using arrow keys
	function navigateToAdjacentBook(direction: 'left' | 'right') {
		if (!Graph || !selectedBook) return;

		const graphData = Graph.graphData();
		const books: Node[] = graphData.nodes.filter((n: Node) => n.group === 'book');

		if (books.length === 0) return;
		if (isGridModeActive) {
			const nextBook = adjacentShelfBook(books, selectedBook.id, direction);
			if (nextBook) selectBook(nextBook);
			return;
		}

		// Get camera position to determine which books are visible
		const camera = Graph.camera();
		const cameraPos = camera.position;

		// Calculate distance from camera to each book
		const booksWithDistance = books.map((book: Node) => {
			const dx = (book.x || 0) - cameraPos.x;
			const dy = (book.y || 0) - cameraPos.y;
			const dz = (book.z || 0) - cameraPos.z;
			return {
				book,
				distance: Math.sqrt(dx * dx + dy * dy + dz * dz)
			};
		});

		// Sort by distance to get nearby books
		booksWithDistance.sort((a, b) => a.distance - b.distance);

		// Get the closest 50 books as "in view"
		const nearbyBooks = booksWithDistance.slice(0, 50).map((b) => b.book);

		// Find current book index
		const currentIndex = nearbyBooks.findIndex((b: Node) => b.id === selectedBook!.id);

		if (currentIndex === -1) {
			// Current book not in nearby list, select the closest one
			if (nearbyBooks.length > 0) {
				selectBook(nearbyBooks[0]);
			}
			return;
		}

		// Calculate next index based on direction
		let nextIndex: number;
		if (direction === 'right') {
			nextIndex = (currentIndex + 1) % nearbyBooks.length;
		} else {
			nextIndex = (currentIndex - 1 + nearbyBooks.length) % nearbyBooks.length;
		}

		const nextBook = nearbyBooks[nextIndex];
		if (nextBook && nextBook.id !== selectedBook.id) {
			// Deselect current book (restore opacity) but don't reset camera
			const currentData = Graph.graphData();
			currentData.nodes.forEach((n: Node) => {
				if (n.__threeObj && n.group === 'book') {
					const materials = Array.isArray(n.__threeObj.material)
						? n.__threeObj.material
						: [n.__threeObj.material];
					materials.forEach((mat: Three.Material) => {
						if ('opacity' in mat) {
							mat.opacity = 1.0;
						}
					});
				}
			});

			// Stop current orbit animation
			if (orbitAnimationId !== null) {
				cancelAnimationFrame(orbitAnimationId);
				animationFrameIds.delete(orbitAnimationId);
				orbitAnimationId = null;
			}

			// Clear orbit resume timeout
			if (orbitResumeTimeoutId) {
				clearTimeout(orbitResumeTimeoutId);
				orbitResumeTimeoutId = null;
			}

			// Select the next book
			selectBook(nextBook);
		}
	}

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		if (event.target instanceof Element && event.target.closest('dialog[open]')) return;
		if (!selectedBook) return;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			navigateToAdjacentBook('left');
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			navigateToAdjacentBook('right');
		} else if (event.key === 'Escape') {
			event.preventDefault();
			deselectBook();
		}
	}

	// Deselect book and restore view
	function deselectBook() {
		if (!Graph || !selectedBook) return;
		detailsRequest?.abort();
		detailsRequest = null;
		isLoadingBookDetails = false;

		removeOrbitListener?.();
		removeOrbitListener = undefined;
		clearTimeout(orbitStartTimeoutId);

		// Stop orbit animation
		if (orbitAnimationId !== null) {
			cancelAnimationFrame(orbitAnimationId);
			animationFrameIds.delete(orbitAnimationId);
			orbitAnimationId = null;
		}

		// Clear orbit resume timeout
		if (orbitResumeTimeoutId) {
			clearTimeout(orbitResumeTimeoutId);
			orbitResumeTimeoutId = null;
		}
		orbitPaused = false;

		// Restore all books to full opacity
		const graphData = Graph.graphData();
		graphData.nodes.forEach((n: Node) => {
			if (n.__threeObj && n.group === 'book') {
				const materials = Array.isArray(n.__threeObj.material)
					? n.__threeObj.material
					: [n.__threeObj.material];
				materials.forEach((mat: Three.Material) => {
					if ('opacity' in mat) {
						mat.opacity = 1.0;
					}
				});
			}
		});

		// Return the book and camera to the shelf position the reader was browsing.
		if (isGridModeActive && shelfSavedCamera) {
			const state = shelfBookPresentations.get(selectedBook.id);
			if (state) animateShelfBook(state.node, false);
			const saved = shelfSavedCamera;
			shelfSavedCamera = null;
			Graph.controls().minDistance = saved.minDistance;
			Graph.controls().maxDistance = saved.maxDistance;
			animateShelfCamera(saved.position, saved.target);
		} else if (isGridModeActive) frameShelves();
		else Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);

		// Remove ISBN from URL
		if (browser) {
			const url = new URL(window.location.href);
			url.pathname = '/library/';
			replaceState(url, {});
		}

		selectedBook = null;
		bookDetails = null;
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
				au?: string;
				authorLastName?: string;
				af?: string;
				authorName?: string;
				n?: string;
				isbn?: string;
				p?: number;
				pages?: number;
				d?: string;
				dateacquired?: string;
				e?: string;
				entrydate?: string;
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
					authorLastName: n.au,
					authorName: n.af,
					isbn: n.n,
					pages: n.p,
					dateacquired: n.d,
					entrydate: n.e,
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
				authorLastName: n.authorLastName || n.au,
				authorName: n.authorName || n.af,
				isbn: n.isbn || n.n,
				pages: n.pages || n.p,
				dateacquired: n.dateacquired || n.d,
				entrydate: n.entrydate || n.e,
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

		if (isDestroyed) return;
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

		if (isDestroyed) return;
		const bookCount = graphData.nodes.filter((n) => n.group === 'book').length;
		loadingProgress = `Organizing ${bookCount} books…`;

		// Allow UI to update before heavy graph creation
		await new Promise((resolve) => requestAnimationFrame(resolve));

		if (isDestroyed) return;
		Graph = new ForceGraph3D(graphContainer)
			.graphData(graphData)
			.nodeLabel((graphNode) => {
				const node = graphNode as Node;
				const label = document.createElement('span');
				label.textContent = libraryText(node.id);
				return label;
			})
			.nodePositionUpdate((object, _position, graphNode) => {
				const node = graphNode as Node;
				const state = shelfBookPresentations.get(node.id);
				if (!state || !isGridModeActive) return false;
				object.position.set(state.pose.x, state.pose.y, state.pose.z);
				object.rotation.set(0, state.pose.rotationY, 0);
				return true;
			})
			.onEngineTick(() => {
				if (isGridModeActive && shelfFramePending) {
					shelfFramePending = false;
					frameShelves();
				}
			})
			.onNodeDrag((graphNode) => {
				const node = graphNode as Node;
				if (isGridModeActive && node.group === 'book') {
					const presentation = shelfBookPresentations.get(node.id);
					if (presentation?.open) {
						if (presentation.frame !== null) { cancelAnimationFrame(presentation.frame); animationFrameIds.delete(presentation.frame); presentation.frame = null; }
						presentation.pose.x = node.x || 0;
						presentation.pose.y = node.y || 0;
						return;
					}
					shelfDraggedPositions.set(node.id, { x: node.x || 0, y: node.y || 0 });
				}
			})
			.onNodeDragEnd(() => {
				if (isGridModeActive) shelfBounds = getShelfBounds();
			})
			.onNodeClick((graphNode) => {
				const node = graphNode as Node;
				if (node.group === 'book') {
					// If a book is already selected
					if (selectedBook) {
						// Tapping the same book deselects it
						if (selectedBook.id === node.id) {
							deselectBook();
						} else {
							// Tapping a different book - deselect first, then select new one
							if (!isGridModeActive) deselectBook();
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
					if (isGridModeActive) frameShelves();
					else Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);
					lastClickedNode = null;
				}
			})
			.onNodeRightClick((graphNode) => {
				const node = graphNode as Node;
				if (node.group === 'book') {
					window.open(`https://librarything.com/work/${node.workcode}`, '_blank');
				}
			})
			.nodeThreeObject((graphNode) => {
				const node = graphNode as Node;
				if (node.group === 'book') {
					return createBookObject(node);
				} else if (node.group === 'ddc' || node.group === 'shelf-label') {
					// In grid mode, only show top-level DDC category labels
					if (isGridModeActive && node.group === 'ddc' && !topLevelDdcNames.has(node.id)) {
						// Return invisible placeholder for non-top-level DDC nodes
						const emptyGroup = new THREE.Group();
						return emptyGroup;
					}
					const sprite = new SpriteText(node.id);
					sprite.color = 'blue';
					sprite.textHeight = isGridModeActive ? 5 : Math.max((node.points || 1) / 2, 3);
					if (isGridModeActive) {
						sprite.color = '#ffffff';
						sprite.backgroundColor = '#242424';
						sprite.padding = 2;
						(sprite as unknown as { center: { set: (x: number, y: number) => void } }).center.set(0, 0.5);
					}
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
		controls.addEventListener('change', constrainShelfCamera);
		controls.addEventListener('start', stopShelfCameraAnimation);
		window.addEventListener('resize', resizeLibrary);
		// Enable touch gestures: one finger = rotate, two fingers = pan/zoom
		controls.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN
		};

		// Store original data for mode switching
		originalGraphData = { ...Graph.graphData() };

		// Restore shared view options before selecting a deep-linked book.
		restoreLibraryView();
		window.addEventListener('popstate', restoreLibraryView);

		// Mark loading complete after a short delay to ensure render is visible
		scheduleFrame(() => {
			isLoading = false;

			// Check for ISBN from route params and select that book
			const bookId = new URL(window.location.href).searchParams.get('book');
			if (data.isbn || bookId) {
				const bookNode = graphData.nodes.find(
					(n: Node) => n.group === 'book' && (data.isbn ? n.isbn === data.isbn : String(n.bookid) === bookId)
				);
				if (bookNode) {
					// Small delay to let the graph render first
					initialSelectionTimeoutId = setTimeout(() => {
						if (!isDestroyed) selectBook(bookNode, false);
					}, 100);
				}
			}
		});

		// Add keyboard event listener for arrow key navigation
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		if (!browser) return;

		// Remove keyboard event listener
		detailsRequest?.abort();
		window.removeEventListener('resize', resizeLibrary);
		Graph?.controls().removeEventListener('change', constrainShelfCamera);
		Graph?.controls().removeEventListener('start', stopShelfCameraAnimation);
		window.removeEventListener('keydown', handleKeydown);
		window.removeEventListener('popstate', restoreLibraryView);

		// Set destroyed flag to stop any ongoing animations
		isDestroyed = true;
		removeOrbitListener?.();
		clearTimeout(orbitStartTimeoutId);
		clearTimeout(initialSelectionTimeoutId);
		if (orbitResumeTimeoutId) clearTimeout(orbitResumeTimeoutId);

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
							node.__threeObj.material.forEach((mat: Three.MeshBasicMaterial) => {
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

	function updateLibraryUrl() {
		const url = writeLibraryView(new URL(window.location.href), isGridModeActive, sortModes[sortIndex]);
		if (url.href !== window.location.href) pushState(url, {});
	}

	function restoreLibraryView() {
		if (!Graph) return;
		const view = readLibraryView(new URL(window.location.href));
		const nextSortIndex = sortModes.indexOf(view.sort);
		const sortChanged = sortIndex !== nextSortIndex;
		sortIndex = nextSortIndex;
		if (isGridModeActive !== view.shelves) toggleMode(false);
		else if (isGridModeActive && sortChanged) applyShelfSort();
	}

	function getShelfBounds(): ShelfBounds {
		const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, depth: 0 };
		for (const node of Graph.graphData().nodes as Node[]) {
			const object = node.__threeObj;
			const x = node.x || 0, y = node.y || 0;
			const isBook = node.group === 'book';
			const width = isBook ? object?.geometry?.parameters?.depth || 2 : object?.scale.x || 5;
			const height = isBook ? object?.geometry?.parameters?.height || 25 : object?.scale.y || 5;
			bounds.minX = Math.min(bounds.minX, x - (isBook ? width / 2 : 0));
			bounds.maxX = Math.max(bounds.maxX, x + (isBook ? width / 2 : width));
			bounds.minY = Math.min(bounds.minY, y - height / 2);
			bounds.maxY = Math.max(bounds.maxY, y + height / 2);
			if (isBook) bounds.depth = Math.max(bounds.depth, (object?.geometry?.parameters?.width || 20) / 2);
		}
		return bounds;
	}

	function frameShelves(duration = 0) {
		stopShelfCameraAnimation();
		if (!Graph || !Graph.graphData().nodes.length) return;
		shelfBounds = getShelfBounds();
		const camera = Graph.camera();
		const frame = shelfCameraFrame(shelfBounds, graphContainer.clientWidth, graphContainer.clientHeight, camera.fov);
		const controls = Graph.controls();
		controls.minDistance = Math.max(shelfBounds.depth + 2, frame.distance * 0.08);
		const tangent = Math.tan(camera.fov * Math.PI / 360);
		controls.maxDistance = Math.max(frame.distance, (shelfBounds.maxY - shelfBounds.minY) / (2 * tangent) * 1.2);
		shelfFramingUntil = performance.now() + duration + 50;
		camera.up.set(0, 1, 0);
		Graph.cameraPosition({ x: frame.x, y: frame.y, z: frame.distance }, { x: frame.x, y: frame.y, z: 0 }, duration);
	}

	function constrainShelfCamera() {
		if (!Graph || !isGridModeActive || selectedBook || !shelfBounds || shelfFramePending || performance.now() < shelfFramingUntil) return;
		const camera = Graph.camera();
		const controls = Graph.controls();
		const halfHeight = Math.max(1, Math.abs(camera.position.z) - shelfBounds.depth) * Math.tan(camera.fov * Math.PI / 360);
		const target = clampShelfTarget(shelfBounds, controls.target.x, controls.target.y,
			halfHeight * camera.aspect, halfHeight, graphContainer.clientHeight);
		const dx = target.x - controls.target.x, dy = target.y - controls.target.y;
		// Translate camera and target together so clamping never tilts the shelf view.
		camera.position.x += dx;
		camera.position.y += dy;
		controls.target.x = target.x;
		controls.target.y = target.y;
	}

	function resizeLibrary() {
		if (!Graph) return;
		Graph.width(graphContainer.clientWidth).height(graphContainer.clientHeight);
		if (isGridModeActive && !selectedBook) frameShelves(0);
	}

	function refreshShelves() {
		clearShelfPresentations();
		shelfDraggedPositions.clear();
		// Recreate labels when changing modes; graph labels use popularity-based sizes.
		Graph.nodeThreeObject(Graph.nodeThreeObject());
		customForce();
		shelfFramePending = true;
		// graphData initializes and reheats the simulation in its deferred update.
		// Reheating here can start rendering before that layout exists on a deep link.
	}

	function toggleMode(updateUrl = true) {
		if (!Graph) return;

		deselectBook();
		shelfDraggedPositions.clear();
		clearShelfPresentations();
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

			const filteredNodes = shelfNodes(currentData.nodes);

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
			controls.enableRotate = false;
			controls.noRotate = true;
			controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
			// In shelf mode: one finger = pan, two fingers = zoom
			controls.touches = {
				ONE: THREE.TOUCH.PAN,
				TWO: THREE.TOUCH.DOLLY_PAN
			};
			refreshShelves();
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

			Graph.nodeThreeObject(Graph.nodeThreeObject());
			Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 700);

			// Re-enable full 3D controls
			const controls = Graph.controls();
			controls.enablePan = true;
			controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
			controls.minPolarAngle = 0;
			controls.maxPolarAngle = Math.PI;
			controls.enableZoom = true;
			controls.enableRotate = true;
			controls.noRotate = false;
			controls.minDistance = 0;
			controls.maxDistance = Infinity;
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
								scheduleFrame(animateRotation);
							}
						}

						scheduleFrame(animateRotation);
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
		if (updateUrl) updateLibraryUrl();
	}

	function toggleSort() {
		if (!Graph || !isGridModeActive) return;

		deselectBook();
		sortIndex = (sortIndex + 1) % sortModes.length;
		applyShelfSort();
		updateLibraryUrl();
	}

	function shelfNodes(source: Node[]): Node[] {
		const sort = sortModes[sortIndex];
		const books = source.filter((node) => node.group === 'book');
		if (sort === 'ddc') {
			return [...books, ...source.filter((node) => node.group === 'ddc' && topLevelDdcNames.has(node.id))];
		}
		if (sort === 'color') return books;
		const years = [...new Set(books.map((book) => libraryShelfYear(book, sort)))];
		return [...books, ...years.map((year) => ({ id: year, group: 'shelf-label' }))];
	}

	function applyShelfSort() {
		const filteredNodes = shelfNodes(originalGraphData.nodes);
		Graph.graphData({ nodes: filteredNodes, links: [] });
		Graph.d3Force('custom', customForce);
		refreshShelves();
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
		const bookHeight = Math.max(25, ...nodes.map((n) => n.__threeObj?.geometry?.parameters?.height || 25));
		const spacingX = bookDepth + 0.5; // Small gap between book spines
		const shelfHeight = bookHeight + 12; // Spacing between shelves (rows)
		const shelfWidth = booksPerShelf * spacingX;
		const shelfStartX = -shelfWidth / 2; // Left edge of shelf
		const labelOffsetX = shelfStartX; // Position for DDC label (left of shelf)
		// Offset centered geometries so every book shares the row's bottom edge.
		const shelfBookY = (node: Node, row: number) =>
			-row * shelfHeight - bookHeight / 2 +
			(node.__threeObj?.geometry?.parameters?.height || bookHeight) / 2;

		if (sortModes[sortIndex] === 'dateacquired' || sortModes[sortIndex] === 'publicationYear') {
			const sort = sortModes[sortIndex];
			const groups = new Map<string, Node[]>();
			for (const book of nodes) {
				const year = libraryShelfYear(book, sort);
				if (!groups.has(year)) groups.set(year, []);
				groups.get(year)!.push(book);
			}
			const headings = Graph.graphData().nodes.filter((node: Node) => node.group === 'shelf-label') as Node[];
			const years = [...groups.keys()].sort((a, b) => (Number(b) || 0) - (Number(a) || 0));
			let shelfRow = 0;
			for (const year of years) {
				const books = groups.get(year)!;
				if (sort === 'dateacquired') books.sort((a, b) => libraryShelfDate(b).localeCompare(libraryShelfDate(a)));
				const heading = headings.find((node) => node.id === year);
				if (heading) {
					heading.x = heading.fx = shelfStartX;
					heading.y = heading.fy = -shelfRow * shelfHeight + bookHeight / 2 + 10;
					heading.z = heading.fz = 5;
				}
				let rowWidth = 0;
				books.forEach((book, index) => {
					if (index % booksPerShelf === 0) rowWidth = 0;
					const depth = book.__threeObj?.geometry?.parameters?.depth || bookDepth;
					book.x = book.fx = shelfStartX + rowWidth + depth / 2;
					book.y = book.fy = shelfBookY(book, shelfRow + Math.floor(index / booksPerShelf));
					book.z = book.fz = 0;
					if (!shelfBookPresentations.has(book.id)) book.__threeObj?.rotation.set(0, Math.PI / 2, 0);
					rowWidth += depth + 0.5;
				});
				shelfRow += Math.ceil(books.length / booksPerShelf) + 0.7;
			}
		} else if (sortModes[sortIndex] === 'ddc') {
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
			const easing = 1;

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
						const targetY = -currentShelfRow * shelfHeight + bookHeight / 2 + 10;
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

						const rowStart = rowWithinCategory * booksPerShelf;
						const precedingWidth = booksInCategory.slice(rowStart, idx).reduce(
							(sum, n) => sum + (n.__threeObj?.geometry?.parameters?.depth || bookDepth) + 0.5, 0);
						const targetX = shelfStartX + precedingWidth + (book.__threeObj?.geometry?.parameters?.depth || bookDepth) / 2;
						const targetY = shelfBookY(book, currentShelfRow + rowWithinCategory);
						const targetZ = 0;

						book.x = (book.x || 0) + (targetX - (book.x || 0)) * easing;
						book.y = (book.y || 0) + (targetY - (book.y || 0)) * easing;
						book.z = targetZ;

						book.fx = book.x;
						book.fy = book.y;
						book.fz = book.z;

						if (book.__threeObj && !shelfBookPresentations.has(book.id)) {
							book.__threeObj.rotation.set(0, Math.PI / 2, 0);
						}
					});

					// Move to next category's shelf rows
					currentShelfRow += rowsNeeded + 0.7;
				});
		} else {
			const keys = new Map(nodes.map((node) => [node.id, colorSortKey(spineColor(node))]));
			nodes.sort((a, b) => compareColorKeys(keys.get(a.id)!, keys.get(b.id)!) || a.id.localeCompare(b.id));

			const easing = 1;
			nodes.forEach((node, index) => {
				const row = Math.floor(index / booksPerShelf);
				const precedingWidth = nodes.slice(row * booksPerShelf, index).reduce(
					(sum, n) => sum + (n.__threeObj?.geometry?.parameters?.depth || bookDepth) + 0.5, 0);

				const targetX = shelfStartX + precedingWidth + (node.__threeObj?.geometry?.parameters?.depth || bookDepth) / 2;
				const targetY = shelfBookY(node, row);
				const targetZ = 0;

				node.x = (node.x || 0) + (targetX - (node.x || 0)) * easing;
				node.y = (node.y || 0) + (targetY - (node.y || 0)) * easing;
				node.z = targetZ;

				node.fx = node.x;
				node.fy = node.y;
				node.fz = node.z;

				if (node.__threeObj && !shelfBookPresentations.has(node.id)) {
					node.__threeObj.rotation.set(0, Math.PI / 2, 0);
				}
			});
		}
		// Keep manual shelf placements until the next sort or view change.
		for (const node of nodes) {
			const dragged = shelfDraggedPositions.get(node.id);
			if (dragged) {
				node.x = node.fx = dragged.x;
				node.y = node.fy = dragged.y;
				node.z = node.fz = 0;
			}
		}
	}
</script>

<svelte:head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="x-ua-compatible" content="ie=edge" />
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
	<button id="modeToggle" aria-label={isGridModeActive ? 'Show graph' : 'Show shelves'} onclick={() => toggleMode()}>{isGridModeActive ? '🕸️ Graph' : '📚 Shelves'}</button>
	<button id="sortToggle" aria-label={`Sort shelves by ${sortModes[(sortIndex + 1) % sortModes.length]}`} title={sortModes[sortIndex] === 'dateacquired' ? 'Acquisition date, or date added to LibraryThing when unavailable' : sortLabels[sortIndex]} onclick={toggleSort} class:hidden={!isGridModeActive}
		>{sortIcons[sortIndex]} {sortLabels[sortIndex]}</button
	>
</div>

{#if selectedBook}
	<aside class="book-sidebar" aria-label="Book details">
		<button class="close-button" onclick={deselectBook} aria-label="Close">×</button>

		<h2 class="book-title">{libraryText(selectedBook.id)}</h2>

		{#if bookDetails}
			<div class="book-details">
				{#if bookDetails.subtitle}
					<p class="book-subtitle">{libraryText(bookDetails.subtitle)}</p>
				{/if}

				{#if bookDetails.authors && bookDetails.authors.length > 0}
					<p class="book-authors">{bookDetails.authors.map(libraryText).join(', ')}</p>
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
							<span class="category-tag">{libraryText(category)}</span>
						{/each}
					</div>
				{/if}

				{#if bookDetails.description}
					<p class="book-description">{libraryText(bookDetails.description.replace(/<[^>]*>/g, ' '))}</p>
				{/if}

				{#if isLoadingBookDetails}<p class="enrichment-status">Loading additional details…</p>{/if}
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
		font-size: 1rem;
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

	/* Book Detail Sidebar - Liquid Glass Effect */
	.book-sidebar {
		position: fixed;
		top: 0;
		right: 0;
		width: 320px;
		height: 100vh;
		background: rgba(128, 128, 128, 0.6);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		z-index: 1500;
		padding: 20px;
		box-sizing: border-box;
		overflow-y: auto;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 0.9rem;
		font-weight: 400;
		line-height: 1.5;
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

	.enrichment-status {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.7);
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
			border-left: none;
			border-top: 1px solid rgba(255, 255, 255, 0.2);
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
