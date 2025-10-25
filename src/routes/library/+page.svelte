<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Nav from '$lib/components/Nav.svelte';

	let graphContainer;
	let Graph;
	let isGridModeActive = false;
	let sortIndex = 0;
	const sortModes = ['dateacquired', 'publicationYear', 'ddc', 'color'];
	const sortIcons = ['📅', '⏳', '📖', '🌈'];
	let sortToggleButton;
	let modeToggleButton;
	let lastClickedNode = null;
	let originalGraphData;

	onMount(async () => {
		if (browser) {
			const ForceGraph3D = (await import('3d-force-graph')).default;
			const THREE = await import('three');
			const SpriteText = (await import('three-spritetext')).default;

			Graph = ForceGraph3D()(graphContainer)
				.jsonUrl('/library/graph.json')
				.onNodeClick((node) => {
					if (node.group === 'book') {
						if (lastClickedNode === node) {
							Graph.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 3000);
							lastClickedNode = null;
						} else {
							const distance = isGridModeActive ? 20 : 40;
							const nodeZ = node.z || 0;
							const distRatio = 1 + distance / Math.hypot(node.x, node.y, nodeZ);
							Graph.cameraPosition(
								{
									x: node.x * distRatio,
									y: node.y * distRatio,
									z: nodeZ * distRatio
								},
								{ x: node.x, y: node.y, z: nodeZ },
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
				.onNodeRightClick((node) => {
					if (node.group === 'book') {
						window.open(`https://librarything.com/work/${node.workcode}`, '_blank');
					}
				})
				.nodeThreeObject((node) => {
					if (node.group === 'book') {
						const depth = node.pages ? Math.max(1, Math.ceil(node.pages / 10)) : 20;
						let frontMaterial, spineMaterial;
						let width, height;
						let averageColor = node.averageColor || '#666666';

						const createSpine = () => {
							const spineCanvas = document.createElement('canvas');
							spineCanvas.width = Math.max(48, depth * 6);
							spineCanvas.height = 384;
							const spineCtx = spineCanvas.getContext('2d');

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
							let lines = [];
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

							const spineTexture = new THREE.CanvasTexture(spineCanvas);
							spineMaterial = new THREE.MeshBasicMaterial({ map: spineTexture });
						};

						const createBackCover = () => {
							const backCanvas = document.createElement('canvas');
							backCanvas.width = 256;
							backCanvas.height = 384;
							const backCtx = backCanvas.getContext('2d');

							backCtx.fillStyle = averageColor;
							backCtx.fillRect(0, 0, backCanvas.width, backCanvas.height);

							const backTexture = new THREE.CanvasTexture(backCanvas);
							return new THREE.MeshBasicMaterial({ map: backTexture });
						};

						if (node.img && node.w && node.h && !isNaN(node.w) && !isNaN(node.h)) {
							const loader = new THREE.TextureLoader();
							const imgTexture = loader.load(
								node.img,
								() => createSpine(),
								undefined,
								(error) => {
									console.error('Failed to load texture:', node.img, error);
									createSpine();
								}
							);
							frontMaterial = new THREE.MeshBasicMaterial({ map: imgTexture });
							width = Math.max(0.1, node.w / 10);
							height = Math.max(0.1, node.h / 10);
							createSpine();
						} else {
							const canvas = document.createElement('canvas');
							canvas.width = 256;
							canvas.height = 384;
							const ctx = canvas.getContext('2d');

							const titleHash = node.id.split('').reduce((a, b) => {
								a = (a << 5) - a + b.charCodeAt(0);
								return a & a;
							}, 0);
							const hue = Math.abs(titleHash) % 360;
							const bgColor = `hsl(${hue}, 60%, 45%)`;
							const textColor = `hsl(${hue}, 60%, 90%)`;
							averageColor = bgColor;

							ctx.fillStyle = bgColor;
							ctx.fillRect(0, 0, canvas.width, canvas.height);

							ctx.fillStyle = textColor;
							ctx.font = 'bold 18px Arial';
							ctx.textAlign = 'center';
							ctx.textBaseline = 'middle';

							const words = node.id.split(' ');
							const lines = [];
							let currentLine = '';

							words.forEach((word) => {
								const testLine = currentLine + word + ' ';
								const metrics = ctx.measureText(testLine);
								if (metrics.width > canvas.width - 40 && currentLine !== '') {
									lines.push(currentLine.trim());
									currentLine = word + ' ';
								} else {
									currentLine = testLine;
								}
							});
							lines.push(currentLine.trim());

							const lineHeight = 22;
							const startY = canvas.height / 2 - (lines.length * lineHeight) / 2;
							lines.forEach((line, index) => {
								ctx.fillText(line, canvas.width / 2, startY + index * lineHeight);
							});

							const texture = new THREE.CanvasTexture(canvas);
							frontMaterial = new THREE.MeshBasicMaterial({ map: texture });

							const randomSeed = Math.abs(titleHash) / 2147483647;
							const simulatedWidth = 120 + randomSeed * 80;
							const simulatedHeight = 180 + randomSeed * 100;
							width = simulatedWidth / 10;
							height = simulatedHeight / 10;

							createSpine();
						}

						const depthVal = Math.max(0.1, depth / 10);
						const geometry = new THREE.BoxGeometry(width, height, depthVal);

						const backMaterial = createBackCover();

						const paperWhite = new THREE.MeshBasicMaterial({ color: 0xf5f5f0 });
						const materials = [
							paperWhite,
							spineMaterial || frontMaterial,
							paperWhite,
							paperWhite,
							frontMaterial,
							backMaterial
						];

						const cube = new THREE.Mesh(geometry, materials);

						cube.rotation.x = Math.random() * 2 * Math.PI;
						cube.rotation.y = Math.random() * 2 * Math.PI;
						cube.rotation.z = Math.random() * 2 * Math.PI;
						return cube;
					} else if (node.group === 'ddc') {
						const sprite = new SpriteText(node.id);
						sprite.color = 'blue';
						sprite.textHeight = Math.max(node.points / 2, 3);
						return sprite;
					}
				})
				.backgroundColor('#808080');

			modeToggleButton.addEventListener('click', toggleMode);
			sortToggleButton.addEventListener('click', toggleSort);
		}
	});

	function toggleMode(event) {
		isGridModeActive = !isGridModeActive;

		if (isGridModeActive) {
			Graph.d3Force('custom', customForce);
			Graph.numDimensions(2);

			let filteredNodes;
			if (sortModes[sortIndex] === 'ddc') {
				filteredNodes = Graph.graphData().nodes.filter(
					(node) => node.group === 'book' || node.group === 'ddc'
				);
			} else {
				filteredNodes = Graph.graphData().nodes.filter((node) => node.group !== 'ddc');
			}

			filteredNodes.forEach((node) => {
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

			sortToggleButton.style.display = 'block';
			event.target.innerHTML = '🕸️';
		} else {
			Graph.d3Force('custom', null);
			Graph.numDimensions(3);

			const currentData = Graph.graphData();
			const originalNodes = originalGraphData.nodes;
			const originalLinks = originalGraphData.links;

			originalNodes.forEach((node) => {
				if (!currentData.nodes.some((currentNode) => currentNode.id === node.id)) {
					currentData.nodes.push(node);
				}
			});

			currentData.links = [];
			originalLinks.forEach((link) => {
				currentData.links.push(link);
			});

			Graph.graphData({ nodes: currentData.nodes, links: currentData.links });

			Graph.controls().enablePan = true;
			Graph.controls().minPolarAngle = 0;
			Graph.controls().maxPolarAngle = Math.PI;
			Graph.controls().enableZoom = true;

			currentData.nodes.forEach((node) => {
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

					let startTime = null;
					const duration = 1000;

					function animateRotation(timestamp) {
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

			sortToggleButton.style.display = 'none';
			event.target.innerHTML = '📚';
		}
	}

	function toggleSort(event) {
		sortIndex = (sortIndex + 1) % sortModes.length;
		event.target.innerHTML = sortIcons[sortIndex];
		if (isGridModeActive) {
			let filteredNodes;
			if (sortModes[sortIndex] === 'ddc') {
				filteredNodes = originalGraphData.nodes.filter(
					(node) => node.group === 'book' || node.group === 'ddc'
				);
			} else {
				filteredNodes = originalGraphData.nodes.filter((node) => node.group !== 'ddc');
			}
			Graph.graphData({ nodes: filteredNodes, links: [] });
			Graph.d3Force('custom', customForce);
		}
	}

	function customForce(alpha) {
		if (!Graph) return;

		let nodes = Graph.graphData().nodes.filter((node) => node.group === 'book');
		let ddcNodes = Graph.graphData().nodes.filter((node) => node.group === 'ddc');

		Graph.graphData().nodes.forEach((node) => {
			if (node.fx !== undefined) delete node.fx;
			if (node.fy !== undefined) delete node.fy;
			if (node.fz !== undefined) delete node.fz;
		});

		const rowSize = 50;
		const nodeSize = nodes.length > 0 && nodes[0].__threeObj ? nodes[0].__threeObj.scale.x : 50;
		const spacingX = nodeSize + 5;
		const spacingY = nodeSize + 30;

		if (sortModes[sortIndex] === 'ddc') {
			nodes.sort((a, b) => (a.ddcCode || '').localeCompare(b.ddcCode || ''));

			const ddcGroups = {};
			nodes.forEach((node) => {
				const ddcClass = (node.ddcCode || '').substring(0, 3);
				if (!ddcGroups[ddcClass]) {
					ddcGroups[ddcClass] = [];
				}
				ddcGroups[ddcClass].push(node);
			});

			const ddcClassNames = {
				'000': 'Computer science, information & general works',
				100: 'Philosophy & psychology',
				200: 'Religion',
				300: 'Social sciences',
				400: 'Language',
				500: 'Science & mathematics',
				600: 'Technology',
				700: 'Arts & recreation',
				800: 'Literature',
				900: 'History & geography'
			};

			let gridIndex = 0;
			const positionMap = new Map();

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
					node.x += (targetX - node.x) * easing;
					node.y += (targetY - node.y) * easing;
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
					node.x += (targetX - node.x) * easing;
					node.y += (targetY - node.y) * easing;
					node.z = targetZ;

					node.fx = node.x;
					node.fy = node.y;
					node.fz = node.z;
				}
			});
		} else {
			nodes.sort((a, b) => {
				if (sortModes[sortIndex] === 'dateacquired') {
					return new Date(b.dateacquired || 0) - new Date(a.dateacquired || 0);
				} else if (sortModes[sortIndex] === 'publicationYear') {
					return (b.publicationYear || 0) - (a.publicationYear || 0);
				} else if (sortModes[sortIndex] === 'color') {
					const getHue = (node) => {
						if (!node.averageColor) return 999;
						const rgb = node.averageColor.match(/\d+/g);
						if (!rgb) return 999;
						const r = parseInt(rgb[0]) / 255;
						const g = parseInt(rgb[1]) / 255;
						const b = parseInt(rgb[2]) / 255;
						const max = Math.max(r, g, b);
						const min = Math.min(r, g, b);
						let h = 0;
						if (max !== min) {
							const d = max - min;
							switch (max) {
								case r:
									h = (g - b) / d + (g < b ? 6 : 0);
									break;
								case g:
									h = (b - r) / d + 2;
									break;
								case b:
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
				node.x += (targetX - node.x) * easing;
				node.y += (targetY - node.y) * easing;
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
	<meta property="og:title" content="📚🕸️ Casey's Library" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://caseyagollan.com/library/" />
	<meta property="og:image" content="https://caseyagollan.com/library/thumbnail.png" />
	<meta property="og:site_name" content="caseyagollan.com" />
	<meta property="og:locale" content="en_US" />
	<title>📚🕸️ Casey's Library</title>
	<link rel="webmention" href="https://webmention.io/caseyagollan.com/webmention" />
</svelte:head>

<div bind:this={graphContainer} class="graph-container"></div>
<Nav currentPage="library" />
<div class="controls">
	<button bind:this={modeToggleButton} id="modeToggle">📚</button>
	<button bind:this={sortToggleButton} id="sortToggle" style="display: none;">📅</button>
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
</style>
