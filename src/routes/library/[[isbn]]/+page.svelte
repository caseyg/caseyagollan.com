<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type * as Three from 'three';
	import { browser } from '$app/environment';
	import { pushState, replaceState } from '$app/navigation';
	import { librarySortModes, libraryShelfYear, libraryShelfDate, readLibraryView, writeLibraryView } from '$lib/library-view';
	import Nav from '$lib/components/Nav.svelte';
	import { Chip } from '$lib/components/ui';
	import { spineTextureSize } from '$lib/library/textures';
	import { colorSortKey, compareColorKeys, placeholderColor, spineColor } from '$lib/library-color';
	import { layoutSpine } from '$lib/library-spine';
	import { libraryText } from '$lib/library-text';
	import { libraryMetadata } from '$lib/library-metadata';
	import { shelfCoverCamera, adjacentShelfBook } from '$lib/library-selection';
	import { orderShelfBooks, coverflowPosition, coverflowDestination, coverflowPose } from '$lib/library-coverflow';
	import { createShelfMotion, sampleShelfMotion, type ShelfMotion, type ShelfPose } from '$lib/library-motion';
	import { shelfCameraFrame, clampShelfTarget, type ShelfBounds } from '$lib/library-camera';
	import type { LayoutRequest, LayoutTick } from '$lib/library/layout.worker';

	interface PageData {
		graphData: GraphData | null;
		isbn: string | null;
		initialBook: Node | null;
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

	interface BookDetails {
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
		sourceUrl?: string;
		infoLink?: string;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let THREE: any;

	let { data }: { data: PageData } = $props();

	let graphContainer: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let Graph: any;
	let isLoading = $state(true);
	let sceneReady = $state(false);
	let previewRect = $state<{ left: number; top: number; width: number; height: number } | null>(null);
	// The preview shows the same picture the 3D book will wear: its catalog image,
	// its larger cover, or (drawn in the browser) its lettered placeholder.
	const initialCover = data.initialBook?.img ? `/library/${data.initialBook.img}`
		: data.initialBook && libraryMetadata(data.initialBook.bookid).coverUrl ? `/library/covers/${data.initialBook.bookid}` : null;
	// Drawn after hydration, so the server's markup and the first client render agree.
	let generatedPreview = $state<{ src: string; aspect: number } | null>(null);
	function drawGeneratedPreview() {
		const book = data.initialBook;
		if (!book || initialCover) return null;
		const canvas = document.createElement('canvas');
		drawPlaceholderCover(canvas, canvas.getContext('2d')!, book, placeholderColor(book.id), placeholderInk(book), 2);
		const cover = libraryMetadata(book.bookid);
		const seed = Math.abs(titleHash(book.id)) / 2147483647;
		const aspect = cover.coverWidth && cover.coverHeight ? cover.coverWidth / cover.coverHeight : (120 + seed * 80) / (180 + seed * 100);
		return { src: canvas.toDataURL(), aspect };
	}
	let loadingProgress = $state('Loading library...');
	let isGridModeActive = $state(false);
	let sortIndex = $state(0);
	const sortModes = librarySortModes;
	const sortLabels = ['Recently acquired', 'Publication year', 'Subject', 'Color'];
	const sortIcons = ['📅', '⏳', '📖', '🌈'];
	let lastClickedNode: Node | null = null;
	let originalGraphData: GraphData;
	let shelfFramePending = false;
	let shelfLayoutDirty = true;
	let shelfBounds: ShelfBounds | null = null;
	let shelfFramingUntil = 0;
	interface BookPose { x: number; y: number; z: number; rotationY: number }
	const shelfBookPresentations = new Map<string, { node: Node; pose: BookPose; frame: number | null; open: boolean }>();
	let shelfSavedCamera: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; minDistance: number; maxDistance: number } | null = null;
	let shelfCameraAnimation: number | null = null;
	let coverflow: { books: Node[]; position: number; x: number; y: number; z: number; width: number; height: number; stride: number; pixels: number } | null = null;
	let coverflowFrame: number | null = null;
	let cancelShelfGesture: (() => void) | undefined;
	const shelfDraggedPositions = new Map<string, { x: number; y: number }>();

	// Book detail overlay state
	let selectedBook: Node | null = $state.raw(data.initialBook);
	let bookDetails: BookDetails | null = $state(data.initialBook ? catalogDetailsFor(data.initialBook) : null);
	let orbitAnimationId: number | null = null;
	let orbitPaused = false;
	let removeOrbitListener: (() => void) | undefined;
	let orbitStartTimeoutId: ReturnType<typeof setTimeout> | undefined;
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

	// The force layout runs in a worker during the opening animation. The page
	// replays one worker tick per frame instead of computing the physics itself.
	let layoutWorker: Worker | null = null;
	const layoutTicks: Float32Array[] = [];
	let layoutDone = false;
	let layoutNodes: Node[] = [];
	let resolveLayout: () => void = () => {};
	const layoutFinished = new Promise<void>((resolve) => (resolveLayout = resolve));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let savedForces: Record<string, any> | null = null;

	function startWorkerLayout(graph: GraphData) {
		layoutNodes = graph.nodes;
		layoutWorker = new Worker(new URL('$lib/library/layout.worker.ts', import.meta.url), { type: 'module' });
		layoutWorker.onmessage = (event: MessageEvent<LayoutTick>) => {
			layoutTicks.push(event.data.positions);
			if (event.data.done) {
				layoutDone = true;
				resolveLayout();
				layoutWorker?.terminate();
				layoutWorker = null;
			}
		};
		const request: LayoutRequest = {
			ids: graph.nodes.map((node) => node.id),
			links: graph.links.map((link) => [String(link.source), String(link.target)]),
			ticks: 300
		};
		layoutWorker.postMessage(request);
	}

	function followWorkerLayout() {
		if (!layoutNodes.length) return;
		// Park the main-thread physics; the worker's ticks drive the nodes. The
		// link force stays: it is cheap and resolves link ends to node objects.
		savedForces = { charge: Graph.d3Force('charge'), center: Graph.d3Force('center') };
		for (const name of Object.keys(savedForces)) Graph.d3Force(name, null);
		let start: number | null = null;
		Graph.d3Force('worker', () => {
			if (!layoutTicks.length) return;
			// Play the worker's ticks at 60 per second, whatever the frame rate.
			start ??= performance.now();
			const layoutTick = Math.min(layoutTicks.length - 1, Math.floor((performance.now() - start) / (1000 / 60)));
			const positions = layoutTicks[layoutTick];
			layoutNodes.forEach((node, index) => {
				node.fx = positions[index * 3];
				node.fy = positions[index * 3 + 1];
				node.fz = positions[index * 3 + 2];
			});
			if (layoutDone && layoutTick >= layoutTicks.length - 1) finishWorkerLayout();
		});
	}

	// settle jumps straight to the final layout and stops the engine there.
	function finishWorkerLayout(settle = false) {
		if (!savedForces || !Graph) return;
		if (settle && layoutTicks.length) {
			const positions = layoutTicks[layoutTicks.length - 1];
			layoutNodes.forEach((node, index) => {
				node.x = positions[index * 3];
				node.y = positions[index * 3 + 1];
				node.z = positions[index * 3 + 2];
				Object.assign(node, { vx: 0, vy: 0, vz: 0 });
			});
		}
		layoutWorker?.terminate();
		layoutWorker = null;
		Graph.d3Force('worker', null);
		for (const node of layoutNodes) {
			delete node.fx;
			delete node.fy;
			delete node.fz;
		}
		layoutNodes = [];
		layoutTicks.length = 0;
		const forces = savedForces;
		savedForces = null;
		for (const [name, force] of Object.entries(forces)) Graph.d3Force(name, force);
		// The layout has settled; stop ticking physics instead of running it to the 15 s cooldown.
		if (!isGridModeActive) Graph.d3AlphaMin(0.001);
		if (settle) {
			// One more tick moves the meshes to the final positions, then the engine stops.
			Graph.d3AlphaDecay(1);
			scheduleFrame(() => scheduleFrame(() => Graph?.d3AlphaDecay(0.0228)));
		}
	}

	// All links share one LineSegments: one draw call instead of one per link.
	let linkLines: Three.LineSegments<Three.BufferGeometry, Three.LineBasicMaterial> | null = null;
	function syncLinkLines() {
		const links = Graph.graphData().links as { source: Node | string; target: Node | string }[];
		if (!linkLines) {
			linkLines = new THREE.LineSegments(new THREE.BufferGeometry(),
				new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.2, depthWrite: false }));
			linkLines!.frustumCulled = false;
			Graph.scene().add(linkLines);
		}
		const geometry = linkLines!.geometry;
		let attribute = geometry.getAttribute('position') as Three.BufferAttribute | undefined;
		if (!attribute || attribute.count < links.length * 2) {
			attribute = new THREE.BufferAttribute(new Float32Array(Math.max(links.length, 1) * 6), 3);
			attribute!.setUsage(THREE.DynamicDrawUsage);
			geometry.setAttribute('position', attribute!);
		}
		const array = attribute!.array as Float32Array;
		let count = 0;
		for (const link of links) {
			if (typeof link.source !== 'object' || typeof link.target !== 'object') continue;
			array[count * 6] = link.source.x || 0;
			array[count * 6 + 1] = link.source.y || 0;
			array[count * 6 + 2] = link.source.z || 0;
			array[count * 6 + 3] = link.target.x || 0;
			array[count * 6 + 4] = link.target.y || 0;
			array[count * 6 + 5] = link.target.z || 0;
			count++;
		}
		geometry.setDrawRange(0, count * 2);
		attribute!.needsUpdate = true;
	}

	// Textures and labels are painted after the graph appears, a few each
	// frame, so the layout settles once instead of waiting on 1,000 canvases.
	// Keyed by what is painted, so a recreated object replaces its stale entry.
	const pendingLabels = new Map<object, () => void>();
	const pendingPaint = new Map<object, () => void>();
	let paintFrame: number | null = null;
	function queuePaint(queue: Map<object, () => void>, key: object, paint: () => void) {
		queue.set(key, paint);
		if (paintFrame === null && !isLoading) paintFrame = scheduleFrame(paintQueued);
	}
	function paintQueued() {
		paintFrame = null;
		const deadline = performance.now() + 4;
		for (const queue of [pendingLabels, pendingPaint]) {
			for (const [key, paint] of queue) {
				queue.delete(key);
				paint();
				if (performance.now() > deadline) break;
			}
			if (performance.now() > deadline) break;
		}
		if (pendingLabels.size || pendingPaint.size) paintFrame = scheduleFrame(paintQueued);
	}

	// Run every letter's shine from the same clock. CSS animations start when
	// their element is created, so letters added when the message grows would
	// otherwise fall out of step with the letters that were already there.
	function shimmerLetter(letter: HTMLElement) {
		for (const animation of letter.getAnimations()) animation.startTime = 0;
	}

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
		// Texture canvases are read back with getImageData for every book. Keep
		// them in CPU memory so each read does not wait on the GPU.
		spineCanvas = document.createElement('canvas');
		spineCtx = spineCanvas.getContext('2d', { willReadFrequently: true })!;
		coverCanvas = document.createElement('canvas');
		coverCtx = coverCanvas.getContext('2d', { willReadFrequently: true })!;
	}

	// Width scales with font size, so measure each string once at a reference
	// size. Changing the canvas font for every trial size dominated texture time.
	const spineTextWidths = new Map<string, number>();
	function measureSpineText(text: string, size: number) {
		let width = spineTextWidths.get(text);
		if (width === undefined) {
			spineCtx.font = '600 100px Arial';
			width = spineCtx.measureText(text).width;
			spineTextWidths.set(text, width);
		}
		return (width * size) / 100;
	}

	function spineCacheKey(node: Node, depth: number, averageColor: string, bookHeight?: number) {
		return `spine_${node.id}_${node.authorLastName || ""}_${depth}_${averageColor}_${bookHeight}`;
	}

	// Performance: Create spine texture with cached canvas
	function createSpineTexture(
		node: Node,
		depth: number,
		averageColor: string,
		bookHeight?: number
	): Three.MeshBasicMaterial {
		const cacheKey = spineCacheKey(node, depth, averageColor, bookHeight);
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
			measureSpineText);
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
	// The material shows the spine color until its cover is decoded and uploaded.
	function loadCoverInto(material: Three.MeshBasicMaterial, url: string): Three.Texture {
		if (textureCache.has(url)) {
			return textureCache.get(url)!;
		}

		const texture = new THREE.Texture();
		// Cover images are sRGB; without this three.js shows them washed out.
		texture.colorSpace = THREE.SRGBColorSpace;
		const image = new Image();
		image.src = url;
		// Decode off the main thread, then hand the cover to the GPU a few per
		// frame. Covers that arrive together otherwise upload in one long frame.
		image.decode().then(() => {
			if (isDestroyed) return;
			coverUploads.push(() => {
				texture.image = image;
				texture.needsUpdate = true;
				applyCoverTexture(material, texture);
			});
			if (coverUploadFrame === null) coverUploadFrame = scheduleFrame(uploadCovers);
		}, () => {});
		textureCache.set(url, texture);
		coverTextureCount++;
		return texture;
	}

	function applyCoverTexture(material: Three.MeshBasicMaterial, texture: Three.Texture) {
		// A selected or coverflow book shows a larger cover for now; give this
		// one to the material it restores when that view ends.
		const borrowed = [highResolutionCover, ...filmstripTextures.values()].filter((entry) => entry?.material === material);
		for (const entry of borrowed) { entry!.original = texture; entry!.color.set(0xffffff); }
		if (borrowed.length) return;
		material.map = texture;
		material.color.set(0xffffff);
		material.needsUpdate = true;
	}

	const coverUploads: (() => void)[] = [];
	let coverUploadFrame: number | null = null;
	function uploadCovers() {
		coverUploadFrame = null;
		if (!isLoading) for (const upload of coverUploads.splice(0, 4)) upload();
		if (coverUploads.length) coverUploadFrame = scheduleFrame(uploadCovers);
	}

	// Performance: Create placeholder cover for books without images
	function createPlaceholderCover(node: Node): {
		material: Three.MeshBasicMaterial;
		paint?: () => void;
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

		// Start as a solid color; the lettered cover is painted later.
		const material = new THREE.MeshBasicMaterial({ color: bgColor });
		materialCache.set(cacheKey, material);
		return {
			material,
			paint: () => {
				// On mobile, keep the simple colored material once the limit is reached.
				if (isMobile && textureCount >= maxGeneratedTexturesOnMobile) return;
				applyCoverTexture(material, createPlaceholderTexture(node, bgColor, `hsl(${hue}, 60%, 90%)`));
				textureCount++;
			},
			width: (120 + randomSeed * 80) / 10,
			height: (180 + randomSeed * 100) / 10,
			averageColor: bgColor
		};
	}

	function titleHash(id: string) {
		return id.split('').reduce((a, b) => {
			a = (a << 5) - a + b.charCodeAt(0);
			return a & a;
		}, 0);
	}

	function placeholderInk(node: Node) {
		return `hsl(${Math.abs(titleHash(node.id)) % 360}, 60%, 90%)`;
	}

	// scale 1 is the shelf-sized texture; a selected book gets a sharp, larger one.
	function createPlaceholderTexture(node: Node, bgColor: string, textColor = "#ffffff", scale = 1): Three.Texture {
		const canvas = scale === 1 ? coverCanvas : document.createElement('canvas');
		const ctx = scale === 1 ? coverCtx : canvas.getContext('2d')!;
		drawPlaceholderCover(canvas, ctx, node, bgColor, textColor, scale);

		if (scale !== 1) {
			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.anisotropy = 8;
			return texture;
		}

		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const texture = new THREE.DataTexture(
			imageData.data,
			canvas.width,
			canvas.height,
			THREE.RGBAFormat
		);
		texture.needsUpdate = true;
		texture.flipY = true;
		texture.colorSpace = THREE.SRGBColorSpace;
		// DataTexture defaults to nearest-pixel sampling, which looks blocky up close.
		texture.magFilter = THREE.LinearFilter;
		texture.minFilter = THREE.LinearMipmapLinearFilter;
		texture.generateMipmaps = true;

		return texture;
	}

	// The lettered cover for books without a cover image. The first-load preview
	// draws the same picture, so it matches the 3D book it crossfades into.
	function drawPlaceholderCover(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, node: Node, bgColor: string, textColor: string, scale: number) {
		canvas.width = 256 * scale;
		canvas.height = 384 * scale;

		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.fillStyle = textColor;
		ctx.font = `bold ${18 * scale}px Arial`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';

		const words = libraryText(node.id).split(' ');
		const lines: string[] = [];
		let currentLine = '';

		words.forEach((word) => {
			const testLine = currentLine + word + ' ';
			const metrics = ctx.measureText(testLine);
			if (metrics.width > canvas.width - 40 * scale && currentLine !== '') {
				lines.push(currentLine.trim());
				currentLine = word + ' ';
			} else {
				currentLine = testLine;
			}
		});
		lines.push(currentLine.trim());

		const lineHeight = 22 * scale;
		const startY = canvas.height / 2 - (lines.length * lineHeight) / 2;
		lines.forEach((line, index) => {
			ctx.fillText(line, canvas.width / 2, startY + index * lineHeight);
		});
	}

	// BoxGeometry draws each face separately. The three paper edges share a
	// material, so put them in one group: four draw calls per book instead of six.
	function paperFacesTogether(geometry: Three.BoxGeometry) {
		const index = geometry.getIndex()!;
		const faces = [0, 1, 2, 3, 4, 5].map((face) => Array.from(index.array.slice(face * 6, face * 6 + 6)));
		const order = [0, 2, 3, 1, 4, 5];
		geometry.setIndex(order.flatMap((face) => faces[face]));
		geometry.clearGroups();
		geometry.addGroup(0, 18, 0);
		geometry.addGroup(18, 6, 1);
		geometry.addGroup(24, 6, 4);
		geometry.addGroup(30, 6, 5);
		return geometry;
	}

	// Create book 3D object
	function createBookObject(node: Node): Three.Mesh<Three.BoxGeometry, Three.MeshBasicMaterial | Three.MeshBasicMaterial[]> {
		const depth = node.pages ? Math.max(1, Math.ceil(node.pages / 10)) : 20;
		let frontMaterial: Three.MeshBasicMaterial;
		let paintPlaceholder: (() => void) | undefined;
		let width: number;
		let height: number;
		let averageColor = spineColor(node);

		if (node.img && node.w && node.h && !isNaN(node.w) && !isNaN(node.h)) {
			const cacheKey = `front_${node.img}`;
			if (!materialCache.has(cacheKey)) {
				const material = new THREE.MeshBasicMaterial({ color: averageColor });
				if (!isMobile || coverTextureCount < maxCoverTexturesOnMobile) loadCoverInto(material, '/library/' + node.img);
				materialCache.set(cacheKey, material);
			}
			frontMaterial = materialCache.get(cacheKey)!;
			width = Math.max(0.1, node.w / 10);
			height = Math.max(0.1, node.h / 10);
		} else {
			const placeholder = createPlaceholderCover(node);
			frontMaterial = placeholder.material;
			paintPlaceholder = placeholder.paint;
			const cover = libraryMetadata(node.bookid);
			width = cover.coverWidth && cover.coverHeight ? 25 * cover.coverWidth / cover.coverHeight : placeholder.width;
			height = cover.coverHeight ? 25 : placeholder.height;
			averageColor = placeholder.averageColor;
		}
		const spineKey = spineCacheKey(node, depth, averageColor, height);
		const spineMaterial = materialCache.get(spineKey) ?? createBackCoverMaterial(averageColor);

		const depthVal = Math.max(0.1, depth / 10);

		// Cache geometries to reduce memory usage
		const geometryKey = `${width}_${height}_${depthVal}`;
		let geometry: Three.BoxGeometry;
		if (geometryCache.has(geometryKey)) {
			geometry = geometryCache.get(geometryKey)!;
		} else {
			geometry = paperFacesTogether(new THREE.BoxGeometry(width, height, depthVal));
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

		const paintSpine = () => {
			const spine = createSpineTexture(node, depth, averageColor, height);
			// A spine painted while another book is selected joins that fade.
			if (fadedBooks && fadedBooks.id !== node.id && spine.opacity !== fadedBooks.opacity) {
				if (!spine.transparent) { spine.transparent = true; spine.needsUpdate = true; }
				spine.opacity = fadedBooks.opacity;
			}
			materials[1] = spine;
		};
		if (selectedBook?.id === node.id) {
			paintPlaceholder?.();
			paintSpine();
			showHighResolutionCover(node, cube);
		} else {
			if (paintPlaceholder) queuePaint(pendingPaint, frontMaterial, paintPlaceholder);
			if (!materialCache.has(spineKey)) queuePaint(pendingPaint, node, paintSpine);
		}
		return cube;
	}

	function stopShelfCameraAnimation() {
		if (shelfCameraAnimation !== null) {
			cancelAnimationFrame(shelfCameraAnimation);
			animationFrameIds.delete(shelfCameraAnimation);
			shelfCameraAnimation = null;
		}
	}

	function clearShelfPresentations() {
		cancelShelfGesture?.();
		stopCoverflowAnimation();
		coverflow = null;
		clearHighResolutionCover();
		clearFilmstripTextures();
		for (const node of (Graph?.graphData().nodes || []) as Node[]) if (node.__threeObj) node.__threeObj.visible = true;
		if (Graph && isGridModeActive) Graph.controls().touches.ONE = THREE.TOUCH.PAN;
		stopShelfCameraAnimation();
		for (const state of shelfBookPresentations.values()) {
			if (state.frame !== null) { cancelAnimationFrame(state.frame); animationFrameIds.delete(state.frame); }
			state.node.__threeObj?.position.set(state.node.x || 0, state.node.y || 0, 0);
			state.node.__threeObj?.rotation.set(0, Math.PI / 2, 0);
			state.node.__threeObj?.scale.setScalar(1);
		}
		shelfBookPresentations.clear();
		shelfSavedCamera = null;
	}

	function animateShelfCamera(position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, durationOverride?: number) {
		stopShelfCameraAnimation();
		const startPosition = { ...Graph.camera().position };
		const startTarget = { ...Graph.controls().target };
		const duration = durationOverride ?? (isLoading || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
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

	function animateShelfBook(node: Node, open: boolean, durationOverride?: number) {
		const book = node.__threeObj;
		if (!book) return;
		const previous = shelfBookPresentations.get(node.id);
		if (previous?.frame != null) {
			cancelAnimationFrame(previous.frame);
			animationFrameIds.delete(previous.frame);
		}
		// A re-sort rebuilds the meshes; carry on from the pose the book was shown in.
		const from: BookPose = previous ? { ...previous.pose }
			: { x: book.position.x, y: book.position.y, z: book.position.z, rotationY: book.rotation.y };
		const pullDistance = Math.max(book.geometry.parameters.width, book.geometry.parameters.height) * 1.4;
		const to: BookPose = { x: node.x || 0, y: node.y || 0, z: open ? pullDistance : 0, rotationY: open ? 0 : Math.PI / 2 };
		const state = { node, pose: { ...from }, frame: null as number | null, open };
		shelfBookPresentations.set(node.id, state);
		const duration = durationOverride ?? (isLoading || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
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
			animateShelfCamera(view.position, view.target, durationOverride);
		}
	}

	function presentShelfBook(node: Node, duration?: number) {
		if (!shelfSavedCamera) shelfSavedCamera = { position: { ...Graph.camera().position }, target: { ...Graph.controls().target },
			minDistance: Graph.controls().minDistance, maxDistance: Graph.controls().maxDistance };
		if (graphContainer.clientWidth <= 600) {
			presentCoverflow(node);
			return;
		}
		for (const state of shelfBookPresentations.values()) if (state.open && state.node.id !== node.id) animateShelfBook(state.node, false);
		animateShelfBook(node, true, duration);
	}

	// Keep a small film strip in front of a stationary camera. Flying between actual
	// shelf coordinates made every book restart the camera, especially across rows.
	function presentCoverflow(node: Node) {
		if (!coverflow) {
			const books = orderShelfBooks((Graph.graphData().nodes as Node[])
				.filter((book) => book.group === 'book' && book.__threeObj)
				.map((book) => ({ node: book, id: book.id, x: book.x, y: book.y, height: book.__threeObj!.geometry.parameters.height })))
				.map((book) => book.node);
			// Normalize covers into a stable frame so unusually large catalog dimensions
			// do not shrink every other cover or pump the camera while browsing.
			const height = 28;
			const width = height * 0.8;
			const z = Math.max(width, height) * 1.4;
			const view = shelfCoverCamera({ x: node.x || 0, y: node.y || 0, z, width, height },
				{ width: graphContainer.clientWidth, height: graphContainer.clientHeight }, Graph.camera().fov);
			const stride = width * 0.85;
			const pixels = stride * graphContainer.clientHeight /
				(2 * (view.position.z - z) * Math.tan(Graph.camera().fov * Math.PI / 360));
			coverflow = { books, position: books.indexOf(node), x: node.x || 0, y: node.y || 0, z, width, height, stride, pixels };
			// A selected mobile strip needs eight meshes, not thousands of transparent
			// shelf faces behind it. Restore the shelves when the reader closes it.
			for (const book of Graph.graphData().nodes as Node[]) if (book.__threeObj) book.__threeObj.visible = false;
			stopShelfCameraAnimation();
			Graph.cameraPosition(view.position, view.target, 0);
			// OrbitControls still owns two-finger pan/zoom and pointer bookkeeping.
			// One-finger motion belongs exclusively to the film strip.
			Graph.controls().touches.ONE = -1;
			paintCoverflow(coverflow.position);
		} else {
			settleCoverflow(coverflow.books.indexOf(node), false);
		}
	}

	const filmstripTextures = new Map<string, { material: Three.MeshBasicMaterial; original: Three.Texture | null; color: Three.Color; texture: Three.Texture }>();
	function clearFilmstripTextures() {
		for (const entry of filmstripTextures.values()) {
			entry.material.map = entry.original;
			entry.material.color.copy(entry.color);
			entry.material.needsUpdate = true;
			entry.texture.dispose();
		}
		filmstripTextures.clear();
	}

	function warmFilmstripCover(node: Node) {
		if (!Array.isArray(node.__threeObj?.material)) return;
		const source = node.img ? `/library/${node.img}` : libraryMetadata(node.bookid).coverUrl ? `/library/covers/${node.bookid}` : null;
		const material = node.__threeObj.material[4];
		if (material.map || filmstripTextures.has(node.id)) return;
		const texture = source ? new THREE.TextureLoader().load(source) : createPlaceholderTexture(node, placeholderColor(node.id));
		filmstripTextures.set(node.id, { material, original: material.map, color: material.color.clone(), texture });
		material.map = texture;
		material.color.set(0xffffff);
		material.needsUpdate = true;
		texture.colorSpace = THREE.SRGBColorSpace;
		// Browsing a whole library must not retain a whole library of GPU textures.
		for (const [id, entry] of filmstripTextures) {
			if (filmstripTextures.size <= 16) break;
			if (shelfBookPresentations.has(id) || selectedBook?.id === id) continue;
			entry.material.map = entry.original;
			entry.material.color.copy(entry.color);
			entry.material.needsUpdate = true;
			entry.texture.dispose();
			filmstripTextures.delete(id);
		}
	}

	function paintCoverflow(position: number) {
		if (!coverflow) return;
		coverflow.position = position;
		const first = Math.max(0, Math.floor(position) - 3);
		const last = Math.min(coverflow.books.length - 1, Math.ceil(position) + 3);
		const visible = new Set(coverflow.books.slice(first, last + 1).map((book) => book.id));
		for (const [id, state] of shelfBookPresentations) {
			if (visible.has(id)) continue;
			state.node.__threeObj?.position.set(state.node.x || 0, state.node.y || 0, 0);
			state.node.__threeObj?.rotation.set(0, Math.PI / 2, 0);
			state.node.__threeObj?.scale.setScalar(1);
			if (state.node.__threeObj) state.node.__threeObj.visible = false;
			shelfBookPresentations.delete(id);
		}
		for (let index = first; index <= last; index++) {
			const node = coverflow.books[index];
			const pose = coverflowPose(index - position, coverflow.stride);
			const state = { node, pose: { x: coverflow.x + pose.x, y: coverflow.y, z: coverflow.z + pose.z, rotationY: pose.rotationY }, frame: null, open: true };
			shelfBookPresentations.set(node.id, state);
			node.__threeObj!.position.set(state.pose.x, state.pose.y, state.pose.z);
			node.__threeObj!.rotation.set(0, pose.rotationY, 0);
			node.__threeObj!.visible = true;
			const dimensions = node.__threeObj!.geometry.parameters;
			node.__threeObj!.scale.setScalar(Math.min(coverflow.width / dimensions.width, coverflow.height / dimensions.height));
			const materials = node.__threeObj!.material;
			for (const material of Array.isArray(materials) ? materials : [materials]) {
				material.transparent = true;
				material.opacity = 1 - Math.min(1, Math.abs(index - position)) * 0.35;
			}
			warmFilmstripCover(node);
		}
	}

	function stopCoverflowAnimation() {
		if (coverflowFrame !== null) {
			cancelAnimationFrame(coverflowFrame);
			animationFrameIds.delete(coverflowFrame);
			coverflowFrame = null;
		}
	}

	function settleCoverflow(destination: number, commit = true) {
		if (!coverflow || destination < 0) return;
		stopCoverflowAnimation();
		const from = coverflow.position;
		const started = performance.now();
		const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
		const step = (now: number) => {
			coverflowFrame = null;
			if (!coverflow) return;
			const progress = duration ? Math.min(1, (now - started) / duration) : 1;
			paintCoverflow(from + (destination - from) * (1 - Math.pow(1 - progress, 3)));
			if (progress < 1) coverflowFrame = scheduleFrame(step);
			else if (commit && selectedBook?.id !== coverflow.books[destination].id) selectBook(coverflow.books[destination], true, false);
		};
		coverflowFrame = scheduleFrame(step);
	}

	function selectSearchResult(url: URL): boolean {
		if (!Graph || isLoading || url.origin !== window.location.origin) return false;
		const match = /^\/library(?:\/([^/]+))?\/?$/.exec(url.pathname);
		if (!match) return false;
		const isbn = match[1] ? decodeURIComponent(match[1]) : null;
		const bookId = url.searchParams.get('book');
		if (!isbn && !bookId) return false;
		const node = Graph.graphData().nodes.find(
			(n: Node) => n.group === 'book' && (isbn ? n.isbn === isbn : String(n.bookid) === bookId)
		);
		if (!node) return false;
		const nextUrl = new URL(window.location.href);
		nextUrl.pathname = url.pathname;
		nextUrl.searchParams.delete('book');
		if (bookId) nextUrl.searchParams.set('book', bookId);
		replaceState(nextUrl, {});
		void selectBook(node, false);
		return true;
	}

	let touchListeners: AbortController | undefined;

	function installTouchSelection() {
		touchListeners = new AbortController();
		const options = { capture: true, signal: touchListeners.signal };
		const pointers = new Set<number>();
		let tap: { x: number; y: number } | null = null;
		let scrub: { pointer: number; x: number; y: number; position: number; lastPosition: number; time: number; velocity: number; active: boolean } | null = null;
		let drawFrame: number | null = null;
		let pendingPosition = 0;
		const endScrub = (cancelled = false) => {
			if (drawFrame !== null) {
				cancelAnimationFrame(drawFrame);
				animationFrameIds.delete(drawFrame);
				drawFrame = null;
				paintCoverflow(pendingPosition);
			}
			if (scrub && coverflow && (scrub.active || Math.abs(coverflow.position - Math.round(coverflow.position)) > 0.001)) {
				const velocity = cancelled || performance.now() - scrub.time > 100 ? 0 : scrub.velocity;
				settleCoverflow(coverflowDestination(coverflow.position, velocity, coverflow.books.length));
			}
			scrub = null;
		};
		cancelShelfGesture = () => { endScrub(true); pointers.clear(); tap = null; };
		window.addEventListener('blur', () => cancelShelfGesture?.(), { signal: touchListeners.signal });
		graphContainer.addEventListener('pointerdown', (event) => {
			if (event.pointerType === 'mouse') return;
			pointers.add(event.pointerId);
			tap = pointers.size === 1 ? { x: event.clientX, y: event.clientY } : null;
			if (pointers.size > 1) { endScrub(true); return; }
			if (!coverflow) return;
			stopCoverflowAnimation();
			coverflow.pixels = coverflow.stride * graphContainer.clientHeight /
				(2 * Math.max(1, Graph.camera().position.z - coverflow.z) * Math.tan(Graph.camera().fov * Math.PI / 360));
			scrub = { pointer: event.pointerId, x: event.clientX, y: event.clientY, position: coverflow.position,
				lastPosition: coverflow.position, time: performance.now(), velocity: 0, active: false };
		}, options);
		graphContainer.addEventListener('pointermove', (event) => {
			if (scrub && coverflow && pointers.size === 1 && event.pointerId === scrub.pointer) {
				const dx = event.clientX - scrub.x;
				const dy = event.clientY - scrub.y;
				if (!scrub.active && Math.abs(dy) > Math.max(8, Math.abs(dx))) endScrub(true);
				else if (scrub.active || Math.abs(dx) > 8) {
					scrub.active = true;
					tap = null;
					pendingPosition = coverflowPosition(scrub.position, dx, coverflow.pixels, coverflow.books.length);
					const now = performance.now();
					const elapsed = now - scrub.time;
					if (elapsed > 0) {
						const weight = 1 - Math.exp(-elapsed / 40);
						scrub.velocity += ((pendingPosition - scrub.lastPosition) / elapsed - scrub.velocity) * weight;
					}
					scrub.lastPosition = pendingPosition;
					scrub.time = now;
					// Pointer events may arrive faster than display refresh. Paint once per frame.
					if (drawFrame === null) drawFrame = scheduleFrame(() => { drawFrame = null; paintCoverflow(pendingPosition); });
				}
			}
			if (tap && pointers.has(event.pointerId) && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap = null;
		}, options);
		graphContainer.addEventListener('pointercancel', (event) => {
			endScrub(true);
			pointers.delete(event.pointerId);
			tap = null;
		}, options);
		graphContainer.addEventListener('lostpointercapture', (event) => {
			if (pointers.has(event.pointerId)) {
				endScrub(true);
				pointers.delete(event.pointerId);
				tap = null;
			}
		}, options);
		graphContainer.addEventListener('pointerup', (event) => {
			if (event.pointerType === 'mouse') return;
			const wasScrubbing = scrub?.active;
			endScrub();
			// Let OrbitControls receive pointerup so it releases capture and touch state.
			// Bypass the graph's stale hover-based touch click detection.
			const isTap = tap && pointers.size === 1 && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 8;
			pointers.delete(event.pointerId);
			tap = null;
			if (!isTap || wasScrubbing) return;
			const rect = Graph.renderer().domElement.getBoundingClientRect();
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
				1 - (event.clientY - rect.top) / rect.height * 2), Graph.camera());
			const books: Node[] = Graph.graphData().nodes.filter((node: Node) => node.group === 'book' && node.__threeObj?.visible);
			const hit = raycaster.intersectObjects(books.map((node) => node.__threeObj!), true)[0];
			let object = hit?.object;
			while (object && !books.some((node) => node.__threeObj === object)) object = object.parent || undefined;
			const node = books.find((node) => node.__threeObj === object);
			if (node && node.id !== selectedBook?.id) void selectBook(node);
			else if (selectedBook) deselectBook();
			else if (isGridModeActive) frameShelves();
			else Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);
		}, options);
	}

	// Select a book and show its details
	function selectBook(node: Node, updateUrl = true, focus = true) {
		clearHighResolutionCover();
		selectedBook = node;
		const catalogDetails = catalogDetailsFor(node);
		bookDetails = catalogDetails;

		// Update URL with ISBN
		if (updateUrl && browser && node.isbn) {
			const url = new URL(window.location.href);
			url.pathname = `/library/${encodeURIComponent(node.isbn)}`;
			url.searchParams.delete('book');
			replaceState(url, {});
		} else if (updateUrl && browser && node.bookid) {
			const url = new URL(window.location.href);
			url.pathname = '/library/';
			url.searchParams.set('book', String(node.bookid));
			replaceState(url, {});
		}

		if (Graph && focus) focusGraphBook(node);
		else if (Graph) showHighResolutionCover(node);
	}

	function catalogDetailsFor(node: Node): BookDetails {
		return {
			title: libraryText(node.id),
			authors: node.authorName ? [libraryText(node.authorName)] : undefined,
			publishedDate: node.publicationYear ? String(node.publicationYear) : undefined,
			pageCount: node.pages,
			...libraryMetadata(node.bookid)
		};
	}

	// Keep just the selected high-resolution texture in GPU memory.
	let highResolutionCover: { material: Three.MeshBasicMaterial; original: Three.Texture | null; color: Three.Color; texture: Three.Texture } | null = null;
	let coverRequest = 0;
	let highResolutionMaterial: Three.MeshBasicMaterial | null = null;
	function clearHighResolutionCover() {
		coverRequest++;
		highResolutionMaterial = null;
		if (!highResolutionCover) return;
		highResolutionCover.material.map = highResolutionCover.original;
		highResolutionCover.material.color.copy(highResolutionCover.color);
		highResolutionCover.material.needsUpdate = true;
		highResolutionCover.texture.dispose();
		highResolutionCover = null;
	}
	// Where the front cover of a book mesh lands on screen, in CSS pixels.
	function coverScreenRect(book: Three.Mesh<Three.BoxGeometry>) {
		const { width, height, depth } = book.geometry.parameters;
		const camera = Graph.camera();
		camera.updateMatrixWorld();
		book.updateMatrixWorld();
		const bounds = graphContainer.getBoundingClientRect();
		let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
		for (const [x, y] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
			const corner = book.localToWorld(new THREE.Vector3(x * width / 2, y * height / 2, depth / 2)).project(camera);
			const px = bounds.left + (corner.x + 1) / 2 * bounds.width;
			const py = bounds.top + (1 - corner.y) / 2 * bounds.height;
			left = Math.min(left, px); right = Math.max(right, px);
			top = Math.min(top, py); bottom = Math.max(bottom, py);
		}
		if (![left, right, top, bottom].every(Number.isFinite) || right - left < 8) return null;
		return { left, top, width: right - left, height: bottom - top };
	}

	// Settles once the selected book's large cover is on its mesh (or there is none).
	let highResolutionReady: Promise<void> = Promise.resolve();
	function showHighResolutionCover(node: Node, object = node.__threeObj) {
		if (!Array.isArray(object?.material)) return;
		const material = object.material[4];
		if (material === highResolutionMaterial) return;
		const hasCover = Boolean(libraryMetadata(node.bookid).coverUrl);
		// Catalog thumbnails without a larger source keep their own texture.
		if (!hasCover && node.img) return;
		clearHighResolutionCover();
		highResolutionMaterial = material;
		if (!hasCover) {
			const texture = createPlaceholderTexture(node, placeholderColor(node.id), placeholderInk(node), 4);
			highResolutionCover = { material, original: material.map, color: material.color.clone(), texture };
			material.map = texture;
			material.color.set(0xffffff);
			material.needsUpdate = true;
			highResolutionReady = Promise.resolve();
			return;
		}
		const request = coverRequest;
		highResolutionReady = new Promise((resolve) => {
			new THREE.TextureLoader().load(`/library/covers/${node.bookid}`, (texture: Three.Texture) => {
				texture.colorSpace = THREE.SRGBColorSpace;
				texture.anisotropy = 8;
				resolve();
				if (request !== coverRequest || selectedBook?.id !== node.id) { texture.dispose(); return; }
				highResolutionCover = { material, original: material.map, color: material.color.clone(), texture };
				material.map = texture;
				material.color.set(0xffffff);
				material.needsUpdate = true;
			}, undefined, () => {
				resolve();
				if (request === coverRequest) highResolutionMaterial = null;
			});
		});
	}

	// Fade other books to 25% opacity, easing from their current opacity.
	let fadeFrame: number | null = null;
	// The opacity books other than the selected one are heading to, for meshes painted mid-fade.
	let fadedBooks: { id: string; opacity: number } | null = null;
	function fadeOtherBooks(node: Node, opacity = 0.25, duration = 800) {
		fadedBooks = { id: node.id, opacity };
		const fades = new Map<Three.Material, { from: number; to: number }>();
		// Paper and cached spines are shared between books. Give the selected book
		// its own copies so it stays opaque while every other book fades.
		const own = node.__threeObj?.material;
		if (Array.isArray(own)) {
			const shared = new Set<Three.Material>();
			for (const n of Graph.graphData().nodes as Node[]) {
				if (n === node || !Array.isArray(n.__threeObj?.material)) continue;
				for (const mat of n.__threeObj.material) shared.add(mat);
			}
			own.forEach((mat, index) => { if (shared.has(mat)) own[index] = mat.clone(); });
		}
		const selected = new Set<Three.Material>(Array.isArray(own) ? own : own ? [own] : []);
		for (const n of Graph.graphData().nodes as Node[]) {
			if (!n.__threeObj || n.group !== 'book') continue;
			const materials = Array.isArray(n.__threeObj.material) ? n.__threeObj.material : [n.__threeObj.material];
			for (const mat of materials as Three.Material[]) {
				if (!('opacity' in mat) || fades.has(mat)) continue;
				// three.js compiles opaque materials to ignore opacity; recompile on the switch.
				if (!mat.transparent) { mat.transparent = true; mat.needsUpdate = true; }
				fades.set(mat, { from: mat.opacity, to: selected.has(mat) ? 1 : opacity });
			}
		}
		if (fadeFrame !== null) cancelAnimationFrame(fadeFrame);
		const started = performance.now();
		const step = (now: number) => {
			const p = duration ? Math.min((now - started) / duration, 1) : 1;
			const t = p * p * (3 - 2 * p);
			for (const [mat, fade] of fades) mat.opacity = fade.from + (fade.to - fade.from) * t;
			fadeFrame = p < 1 ? scheduleFrame(step) : null;
		};
		step(started);
	}

	function focusGraphBook(node: Node, animate = true) {
		showHighResolutionCover(node);
		if (isGridModeActive) presentShelfBook(node);
		Graph.controls().minDistance = 0.1;
		Graph.controls().maxDistance = Infinity;
		if (coverflow) return;
		fadeOtherBooks(node);

		if (!isGridModeActive) {
			// Start orbit animation around the selected book
			const bookX = node.x || 0;
			const bookY = node.y || 0;
			const bookZ = node.z || 0;
			const orbitRadius = 40;
			const orbitSpeed = 0.0003; // radians per millisecond
			let startTime: number | null = null;
			const blendDuration = 1400;
			let blendFrom: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } | null =
				animate ? { position: { ...Graph.camera().position }, target: { ...Graph.controls().target } } : null;

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
				const angle = Math.PI / 2 + elapsed * orbitSpeed * orbitDirection;
				// The force simulation keeps moving the selected book during startup.
				const bookX = node.x || 0;
				const bookY = node.y || 0;
				const bookZ = node.z || 0;

				// Orbit in XZ plane around the book
				let cameraX = bookX + orbitRadius * Math.cos(angle);
				let cameraZ = bookZ + orbitRadius * Math.sin(angle);
				let cameraY = bookY + 10; // Slightly above
				let targetX = bookX, targetY = bookY, targetZ = bookZ;
				// Center the book in the part of the view the sidebar leaves open, as
				// shelfCoverCamera does: slide camera and target along the view's right
				// (desktop sidebar) or down (mobile bottom sheet).
				const reach = Math.hypot(orbitRadius, 10) * Math.tan(Graph.camera().fov * Math.PI / 360);
				const viewWidth = graphContainer.clientWidth, viewHeight = graphContainer.clientHeight;
				const slide = viewWidth > 600 ? 320 / viewHeight * reach : 0;
				const drop = viewWidth > 600 ? 0 : 0.5 * reach;
				const slideX = slide * Math.sin(angle), slideZ = -slide * Math.cos(angle);
				cameraX += slideX; cameraZ += slideZ; cameraY -= drop;
				targetX += slideX; targetZ += slideZ; targetY -= drop;
				// Blend from where the camera was into the moving orbit, so the zoom
				// and the orbit are one continuous motion with no stop between them.
				if (blendFrom && elapsed < blendDuration) {
					const p = elapsed / blendDuration;
					const t = p * p * (3 - 2 * p);
					const mix = (a: number, b: number) => a + (b - a) * t;
					cameraX = mix(blendFrom.position.x, cameraX);
					cameraY = mix(blendFrom.position.y, cameraY);
					cameraZ = mix(blendFrom.position.z, cameraZ);
					targetX = mix(blendFrom.target.x, targetX);
					targetY = mix(blendFrom.target.y, targetY);
					targetZ = mix(blendFrom.target.z, targetZ);
				} else blendFrom = null;

				Graph.cameraPosition(
					{ x: cameraX, y: cameraY, z: cameraZ },
					{ x: targetX, y: targetY, z: targetZ },
					0 // Instant update for smooth orbit
				);

				orbitAnimationId = scheduleFrame(orbitCamera);
			}

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
						blendFrom = { position: { ...Graph.camera().position }, target: { ...Graph.controls().target } };
					}
				}, 5000);
			};

			// Listen for user interaction
			removeOrbitListener?.();
			controls.addEventListener('start', pauseOrbit);
			removeOrbitListener = () => controls.removeEventListener('start', pauseOrbit);

			clearTimeout(orbitStartTimeoutId);
			if (orbitAnimationId !== null) cancelAnimationFrame(orbitAnimationId);
			orbitAnimationId = scheduleFrame(orbitCamera);

		}

	}

	// Navigate to next/previous book using arrow keys
	function navigateToAdjacentBook(direction: 'left' | 'right') {
		if (!Graph || !selectedBook) return;
		if (coverflow) {
			const index = coverflow.books.indexOf(selectedBook) + (direction === 'right' ? 1 : -1);
			const next = coverflow.books[index];
			if (next) selectBook(next);
			return;
		}

		const graphData = Graph.graphData();
		const books: Node[] = graphData.nodes.filter((n: Node) => n.group === 'book');

		if (books.length === 0) return;
		if (isGridModeActive) {
			const shelfBooks = books.map((book) => ({ node: book, id: book.id, x: book.x, y: book.y, height: book.__threeObj?.geometry.parameters.height }));
			const nextBook = adjacentShelfBook(shelfBooks, selectedBook.id, direction)?.node;
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
			// focusGraphBook crossfades the opacity from the old book to the new one.

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
	function stopOrbit() {
		removeOrbitListener?.();
		removeOrbitListener = undefined;
		clearTimeout(orbitStartTimeoutId);
		if (orbitAnimationId !== null) {
			cancelAnimationFrame(orbitAnimationId);
			animationFrameIds.delete(orbitAnimationId);
			orbitAnimationId = null;
		}
		if (orbitResumeTimeoutId) {
			clearTimeout(orbitResumeTimeoutId);
			orbitResumeTimeoutId = null;
		}
		orbitPaused = false;
	}

	function deselectBook() {
		clearHighResolutionCover();
		if (!selectedBook) return;

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

		if (Graph) {
			// Restore all books to full opacity
			if (fadeFrame !== null) { cancelAnimationFrame(fadeFrame); fadeFrame = null; }
			fadedBooks = null;
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
				const saved = shelfSavedCamera;
				const state = shelfBookPresentations.get(selectedBook.id);
				if (coverflow) clearShelfPresentations();
				else if (state) animateShelfBook(state.node, false);
				shelfSavedCamera = null;
				Graph.controls().minDistance = saved.minDistance;
				Graph.controls().maxDistance = saved.maxDistance;
				animateShelfCamera(saved.position, saved.target);
			} else if (isGridModeActive) frameShelves();
			else Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);

		}

		// Remove ISBN from URL
		if (browser) {
			const url = new URL(window.location.href);
			url.pathname = '/library/';
			url.searchParams.delete('book');
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
		generatedPreview = drawGeneratedPreview();
		if (!browser) return;

		if (selectedBook) void selectBook(selectedBook, false);
		// Give the server-rendered sidebar a paint before starting the visualization.
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		if (isDestroyed) return;

		try {
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

			startWorkerLayout(graphData);

			// Allow UI to update before heavy graph creation
			await new Promise((resolve) => requestAnimationFrame(resolve));

			if (isDestroyed) return;
			Graph = new ForceGraph3D(graphContainer, { controlType: 'orbit' })
				.enableNodeDrag(!isMobile)
				.graphData(graphData)
				.nodeLabel((graphNode) => {
					if (isMobile || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return '';
					const node = graphNode as Node;
					const label = document.createElement('span');
					label.textContent = libraryText(node.id);
					return label;
				})
				.nodePositionUpdate((object, _position, graphNode) => {
					const node = graphNode as Node;
					const state = shelfBookPresentations.get(node.id);
					if (!isGridModeActive) return false;
					if (state) {
						object.position.set(state.pose.x, state.pose.y, state.pose.z);
						object.rotation.set(0, state.pose.rotationY, 0);
						return true;
					}
					const motion = shelfLayoutMotions.get(node.id);
					if (!motion) {
						if (node.group === 'book') object.rotation.set(0, Math.PI / 2, 0);
						return false;
					}
					const { pose, settled } = sampleShelfMotion(motion, performance.now());
					object.position.set(pose.x, pose.y, pose.z);
					object.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ);
					if (settled) shelfLayoutMotions.delete(node.id);
					return true;
				})
				.linkVisibility(false)
				.onEngineTick(() => {
					syncLinkLines();
					if (isGridModeActive && shelfFramePending) {
						shelfFramePending = false;
						// graphData creates its meshes in a deferred update. Measure the
						// finished objects once, rather than laying out placeholders every tick.
						shelfLayoutDirty = true;
						customForce();
						startShelfLayoutMotions();
						const framed = frameShelves(isLoading ? 0 : 600);
						const book = Graph.graphData().nodes.find((node: Node) => node.id === selectedBook?.id);
						if (book) {
							// Closing the book returns to the framed shelves, not the camera mid-transition.
							shelfSavedCamera = framed;
							selectedBook = book;
							focusGraphBook(book, false);
						}
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
				.onNodeClick((graphNode, event) => {
					if (event instanceof PointerEvent && event.pointerType !== 'mouse') return;
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
				.onBackgroundClick((event) => {
					if (event instanceof PointerEvent && event.pointerType !== 'mouse') return;
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
						if (!isGridModeActive) {
							const label = new THREE.Group();
							queuePaint(pendingLabels, node, () => {
								const sprite = new SpriteText(node.id);
								sprite.color = 'blue';
								sprite.textHeight = Math.max((node.points || 1) / 2, 3);
								label.add(sprite);
							});
							return label;
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

			installTouchSelection();
			followWorkerLayout();

			// Store original data for mode switching
			originalGraphData = { ...Graph.graphData() };

			// Restore shared view options before selecting a deep-linked book.
			restoreLibraryView();
			window.addEventListener('popstate', restoreLibraryView);

			const reveal = async () => {
				// Crossfade only once the 3D book wears the same cover as the preview.
				await Promise.race([highResolutionReady, new Promise((resolve) => setTimeout(resolve, 1500))]);
				await new Promise((resolve) => scheduleFrame(() => scheduleFrame(resolve)));
				if (isDestroyed) return;
				// Glide the preview onto the 3D cover's exact spot, then crossfade.
				const rect = selectedBook?.__threeObj?.visible ? coverScreenRect(selectedBook.__threeObj) : null;
				if (rect) {
					previewRect = rect;
					await new Promise((resolve) => setTimeout(resolve, 320));
				}
				sceneReady = true;
				isLoading = false;
				if (paintFrame === null) paintFrame = scheduleFrame(paintQueued);
			};
			const bookNode = selectedBook ? graphData.nodes.find((node) => node.id === selectedBook?.id) : undefined;
			if (bookNode) selectedBook = bookNode;
			if (bookNode && isGridModeActive) {
				// The shelf presents the book with no motion while loading; reveal once it has.
				const waitForShelf = () => (shelfFramePending ? scheduleFrame(waitForShelf) : reveal());
				scheduleFrame(waitForShelf);
			} else if (bookNode) {
				// A book link skips the opening animation: settle the layout in the
				// worker, then show the 3D book exactly where the cover image sits.
				await layoutFinished;
				if (isDestroyed || isGridModeActive || selectedBook !== bookNode) { reveal(); return; }
				finishWorkerLayout(true);
				await new Promise((resolve) => scheduleFrame(() => scheduleFrame(resolve)));
				const book = bookNode.__threeObj;
				if (book) {
					book.rotation.set(0, 0, 0);
					const { width, height } = book.geometry.parameters;
					const view = shelfCoverCamera({ x: bookNode.x || 0, y: bookNode.y || 0, z: bookNode.z || 0, width, height },
						{ width: graphContainer.clientWidth, height: graphContainer.clientHeight }, Graph.camera().fov);
					Graph.cameraPosition(view.position, view.target, 0);
					showHighResolutionCover(bookNode, book);
					// The cover stands alone at first; the graph fades in as the camera pulls back.
					fadeOtherBooks(bookNode, 0, 0);
				}
				await reveal();
				// After the crossfade, ease from the cover into the usual orbit.
				setTimeout(() => {
					if (!isDestroyed && selectedBook === bookNode && !isGridModeActive) focusGraphBook(bookNode);
				}, 700);
			} else {
				scheduleFrame(reveal);
			}

			// Add keyboard event listener for arrow key navigation
			window.addEventListener('keydown', handleKeydown);
		} catch (error) {
			console.error('Library graph failed to load', error);
			loadingProgress = 'The graph could not load. Book details are still available.';
		}
	});

	onDestroy(() => {
		clearHighResolutionCover();
		if (!browser) return;
		layoutWorker?.terminate();
		linkLines?.geometry.dispose();
		linkLines?.material.dispose();
		cancelShelfGesture?.();
		stopCoverflowAnimation();
		clearFilmstripTextures();

		// Remove keyboard event listener
		touchListeners?.abort();
		window.removeEventListener('resize', resizeLibrary);
		Graph?.controls().removeEventListener('change', constrainShelfCamera);
		Graph?.controls().removeEventListener('start', stopShelfCameraAnimation);
		window.removeEventListener('keydown', handleKeydown);
		window.removeEventListener('popstate', restoreLibraryView);

		// Set destroyed flag to stop any ongoing animations
		isDestroyed = true;
		removeOrbitListener?.();
		clearTimeout(orbitStartTimeoutId);
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
		if (isGridModeActive !== view.shelves) toggleMode(false, isLoading);
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
		if (!Graph || !Graph.graphData().nodes.length) return null;
		shelfBounds = getShelfBounds();
		const camera = Graph.camera();
		const frame = shelfCameraFrame(shelfBounds, graphContainer.clientWidth, graphContainer.clientHeight, camera.fov);
		const controls = Graph.controls();
		controls.minDistance = Math.max(shelfBounds.depth + 2, frame.distance * 0.08);
		const tangent = Math.tan(camera.fov * Math.PI / 360);
		controls.maxDistance = Math.max(frame.distance, (shelfBounds.maxY - shelfBounds.minY) / (2 * tangent) * 1.2);
		shelfFramingUntil = performance.now() + duration + 50;
		camera.up.set(0, 1, 0);
		const position = { x: frame.x, y: frame.y, z: frame.distance };
		const target = { x: frame.x, y: frame.y, z: 0 };
		if (duration) animateShelfCamera(position, target);
		else Graph.cameraPosition(position, target, 0);
		return { position, target, minDistance: controls.minDistance, maxDistance: controls.maxDistance };
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
		if (isGridModeActive && selectedBook) {
			const open = !coverflow && graphContainer.clientWidth > 600 && shelfBookPresentations.get(selectedBook.id)?.open;
			if (open) {
				// Reframe around the open book without pulling it back onto the shelf first.
				const camera = { position: { ...Graph.camera().position }, target: { ...Graph.controls().target } };
				shelfSavedCamera = frameShelves(0);
				Graph.cameraPosition(camera.position, camera.target, 0);
				presentShelfBook(selectedBook, 0);
				return;
			}
			clearShelfPresentations();
			frameShelves(0);
			focusGraphBook(selectedBook, false);
			return;
		}
		if (isGridModeActive && !selectedBook) frameShelves(0);
	}

	// The camera uses final shelf coordinates; only rendered poses follow springs.
	const shelfLayoutStarts = new Map<string, { pose: ShelfPose; velocity?: ShelfPose }>();
	const shelfLayoutMotions = new Map<string, ShelfMotion>();
	function beginShelfLayoutTransition() {
		shelfLayoutStarts.clear();
		if (isLoading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			shelfLayoutMotions.clear();
			return;
		}
		const now = performance.now();
		for (const node of Graph.graphData().nodes as Node[]) {
			const object = node.__threeObj;
			if (node.group !== 'book' || !object) continue;
			const previous = shelfLayoutMotions.get(node.id);
			const current = previous ? sampleShelfMotion(previous, now) : null;
			shelfLayoutStarts.set(node.id, {
				pose: current?.pose || { x: object.position.x, y: object.position.y, z: object.position.z,
					rotationX: object.rotation.x, rotationY: object.rotation.y, rotationZ: object.rotation.z },
				velocity: current && !current.settled ? current.velocity : undefined
			});
		}
		shelfLayoutMotions.clear();
	}

	function refreshShelves(changingMode = true) {
		// A re-sort keeps the open book where it is; it glides to its new slot once laid out.
		if (changingMode || !selectedBook || coverflow || !shelfBookPresentations.get(selectedBook.id)?.open) clearShelfPresentations();
		shelfDraggedPositions.clear();
		// Recreate labels when changing modes; graph labels use popularity-based sizes.
		// A re-sort reuses the meshes, so the selected book is not rebuilt mid-presentation.
		if (changingMode) Graph.nodeThreeObject(Graph.nodeThreeObject());
		shelfLayoutDirty = true;
		shelfFramePending = true;
		// graphData reheats the simulation after its deferred update.
	}

	function startShelfLayoutMotions() {
		const now = performance.now();
		for (const node of Graph.graphData().nodes as Node[]) {
			const start = shelfLayoutStarts.get(node.id);
			if (!start) continue;
			shelfLayoutMotions.set(node.id, createShelfMotion(node.id, start.pose, {
				x: node.x || 0, y: node.y || 0, z: node.z || 0,
				rotationX: 0, rotationY: Math.PI / 2, rotationZ: 0
			}, now, start.velocity));
		}
		shelfLayoutStarts.clear();
	}

	function toggleMode(updateUrl = true, preserveSelection = false) {
		if (!Graph) return;

		finishWorkerLayout();
		beginShelfLayoutTransition();
		if (!preserveSelection) deselectBook();
		else stopOrbit();
		shelfDraggedPositions.clear();
		clearShelfPresentations();
		isGridModeActive = !isGridModeActive;
		// Shelf motions are sampled on physics ticks, so shelves keep ticking to the cooldown.
		Graph.d3AlphaMin(isGridModeActive ? 0 : 0.001);

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
			// Shelf gestures navigate the camera, even when they start over a book.
			Graph.enableNodeDrag(false);

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
			Graph.enableNodeDrag(!isMobile);

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
			if (preserveSelection && selectedBook) {
				// The graph recreates its nodes and objects; refocus the same book once they exist.
				const id = selectedBook.id;
				scheduleFrame(() => scheduleFrame(() => {
					const node = (Graph.graphData().nodes as Node[]).find((n) => n.group === 'book' && n.id === id);
					if (!node || isGridModeActive || selectedBook?.id !== id) return;
					selectedBook = node;
					focusGraphBook(node);
				}));
			} else {
				Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 700);
			}

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
			if (!isMobile && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
							if (isDestroyed || isGridModeActive) return;
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

		// The re-sorted shelves present the selected book again once laid out.
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
		beginShelfLayoutTransition();
		const filteredNodes = shelfNodes(originalGraphData.nodes);
		Graph.graphData({ nodes: filteredNodes, links: [] });
		Graph.d3Force('custom', customForce);
		refreshShelves(false);
	}

	function customForce() {
		if (!Graph || !shelfLayoutDirty) return;
		shelfLayoutDirty = false;

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
	<div class="loading-overlay" class:with-book={selectedBook !== null}>
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
					<span class="shimmer-letter" style="animation-delay: {i * 0.03}s" use:shimmerLetter>{letter === ' ' ? '\u00A0' : letter}</span>
				{/each}
			</p>
		</div>
	</div>
{/if}
{#if data.initialBook && selectedBook}
	<div class="book-preview" class:ready={sceneReady} aria-hidden="true">
		{#if initialCover}
			<img src={initialCover} alt="" fetchpriority="high" loading="eager" class:placed={previewRect}
				style:left={previewRect && `${previewRect.left}px`} style:top={previewRect && `${previewRect.top}px`}
				style:width={previewRect && `${previewRect.width}px`} style:height={previewRect && `${previewRect.height}px`} />
		{:else if generatedPreview}
			<img src={generatedPreview.src} alt="" class="generated" class:placed={previewRect} style:aspect-ratio={generatedPreview.aspect}
				style:left={previewRect && `${previewRect.left}px`} style:top={previewRect && `${previewRect.top}px`}
				style:width={previewRect && `${previewRect.width}px`} style:height={previewRect && `${previewRect.height}px`} />
		{:else}
			<div class="preview-placeholder" class:placed={previewRect} style:background={placeholderColor(data.initialBook.id)} style:color={placeholderInk(data.initialBook)}
				style:left={previewRect && `${previewRect.left}px`} style:top={previewRect && `${previewRect.top}px`}
				style:width={previewRect && `${previewRect.width}px`} style:height={previewRect && `${previewRect.height}px`}>{libraryText(data.initialBook.id)}</div>
		{/if}
	</div>
{/if}
<div bind:this={graphContainer} class="graph-container" class:ready={sceneReady}></div>
<Nav currentPage="library" onSearchResultClick={selectSearchResult} />
<div class="controls" class:hidden={isLoading}>
	<button id="modeToggle" aria-label={isGridModeActive ? 'Show graph' : 'Show shelves'} onclick={() => toggleMode(true, true)}>{isGridModeActive ? '🕸️ Graph' : '📚 Shelves'}</button>
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
							<Chip variant="soft" size="sm">{libraryText(category)}</Chip>
						{/each}
					</div>
				{/if}

				{#if bookDetails.description}
					<p class="book-description">{libraryText(bookDetails.description.replace(/<[^>]*>/g, ' '))}</p>
				{/if}

				<div class="book-links">
					{#if bookDetails.sourceUrl}
						<a href={bookDetails.sourceUrl} target="_blank" rel="noopener noreferrer" class="book-link">
							Open Library →
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

	.book-preview {
		position: fixed;
		inset: 0 320px 0 0;
		display: grid;
		place-items: center;
		pointer-events: none;
		opacity: 1;
		transition: opacity 600ms ease;
	}
	.book-preview.ready { opacity: 0; }
	.book-preview img, .preview-placeholder {
		/* Roughly where shelfCoverCamera frames the 3D book (1/1.35 of the view);
		   .placed then glides it onto the exact spot before the crossfade. */
		width: auto;
		max-width: 74%;
		height: 74vh;
		object-fit: contain;
		box-shadow: 0 12px 32px #0004;
	}
	.book-preview img.generated { object-fit: fill; }
	.preview-placeholder { padding: 24px; aspect-ratio: 2 / 3; box-sizing: border-box; display: grid; place-items: center; text-align: center; font: bold 18px Arial, sans-serif; }
	.book-preview .placed {
		position: fixed;
		max-width: none;
		object-fit: fill;
		transition: left 300ms ease, top 300ms ease, width 300ms ease, height 300ms ease;
	}
	@media (max-width: 600px) {
		.book-preview { inset: 0 0 50vh; }
		.book-preview img, .preview-placeholder { height: 37vh; }
	}
	@media (prefers-reduced-motion: reduce) {
		.book-preview, .graph-container { transition: none !important; }
		.book-sidebar { animation: none !important; }
	}
	.graph-container {
		width: 100vw;
		height: 100vh;
		touch-action: none;
		opacity: 0;
		transition: opacity 600ms ease;
	}
	.graph-container.ready { opacity: 1; }

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

	.loading-overlay.with-book { display: none; }

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
		flex-wrap: nowrap;
		overflow-x: auto;
		gap: var(--space-2);
		padding-bottom: var(--space-1);
		margin-bottom: 16px;
	}

	.book-categories :global(.chip) {
		flex: 0 0 auto;
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
		}

		.book-title {
			font-size: 1.1rem;
		}
	}
</style>
