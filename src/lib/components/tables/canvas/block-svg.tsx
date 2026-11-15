import type { Block } from '$lib/tables';
import { blockIcon } from '$lib/tables';

/*
 * A block as it is exported for a table's picture: the same layout as `BlockCard`, written out with
 * literal values, because an exported SVG is shown as an image, where the page's styles and design
 * tokens don't reach. Keep it in step with BlockCard.svelte.
 */
const INK = '#fff';
const MUTED = 'rgba(255,255,255,0.68)';
const SECONDARY = 'rgba(255,255,255,0.86)';
const GROUND = 'gray';
const ACCENT = 'blue';
const FONT = "ff-dagny-web-pro, 'Avenir Next', Avenir, 'Helvetica Neue', Helvetica, Arial, sans-serif";

const pictures = new Map<string, Promise<string | null>>();

/** The site's own picture host sends no CORS headers; its pictures are read through this origin instead. */
const readable = (src: string) => {
	const url = new URL(src, location.origin);
	return url.hostname === 'files.caseyagollan.com' ? `/api/tables/picture?src=${encodeURIComponent(url.href)}` : url.href;
};

/** A small JPEG of a block's picture, inlined so the exported SVG needs nothing else to show. */
export function pictureData(src: string, width: number): Promise<string | null> {
	const key = `${src} ${width}`;
	let found = pictures.get(key);
	if (!found) {
		found = new Promise((resolve) => {
			const image = new Image();
			image.crossOrigin = 'anonymous';
			image.decoding = 'async';
			image.onload = () => {
				try {
					const scale = Math.min(1, width / image.naturalWidth);
					const canvas = document.createElement('canvas');
					canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
					canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
					canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
					resolve(canvas.toDataURL('image/jpeg', 0.72));
				} catch {
					resolve(null); // A picture from a host that doesn't allow it taints the canvas.
				}
			};
			image.onerror = () => resolve(null);
			image.src = new URL(readable(src), location.origin).href;
		});
		pictures.set(key, found);
	}
	return found;
}

const clamp = (lines: number) => ({ display: '-webkit-box', WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: lines, overflow: 'hidden' });

export function BlockSvg({ block, w, h, picture }: { block: Block; w: number; h: number; picture: string | null }) {
	const text = !picture;
	const quote = block.kind === 'quote' && !!block.excerpt;
	const whole = block.kind === 'book' || block.kind === 'image';
	return (
		<foreignObject x={0} y={0} width={w} height={h}>
			<div
				// @ts-expect-error The XHTML namespace makes the content render inside an SVG image.
				xmlns="http://www.w3.org/1999/xhtml"
				style={{
					position: 'relative',
					boxSizing: 'border-box',
					width: w,
					height: h,
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
					borderRadius: 4,
					border: text ? `2px solid ${ACCENT}` : undefined,
					background: text ? GROUND : 'rgba(0,0,0,0.18)',
					color: INK,
					fontFamily: FONT,
					lineHeight: 1.35
				}}
			>
				{picture && (
					<div style={{ flex: 1, minHeight: 0 }}>
						<img src={picture} style={{ display: 'block', width: '100%', height: '100%', objectFit: whole ? 'contain' : 'cover', objectPosition: whole ? 'center' : 'top' }} />
					</div>
				)}
				<div style={{ padding: picture ? '8px 12px' : '12px 40px 12px 12px', background: picture ? 'rgba(0,0,0,0.35)' : undefined, flex: text ? 1 : undefined, minHeight: 0 }}>
					{quote ? (
						<div style={{ fontSize: 16, lineHeight: 1.5, overflow: 'hidden', maxHeight: h - 56 }}>{block.excerpt}</div>
					) : (
						<div style={{ margin: 0, fontSize: picture ? 14 : 16, fontWeight: 600, lineHeight: 1.2, ...clamp(picture ? 2 : 3) }}>{block.title}</div>
					)}
					{(quote ? block.title : block.meta) && <div style={{ marginTop: 4, color: text ? SECONDARY : MUTED, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quote ? block.title : block.meta}</div>}
					{text && !quote && block.excerpt && <div style={{ marginTop: 8, color: SECONDARY, fontSize: 14, lineHeight: 1.5, overflow: 'hidden', maxHeight: h - 100 }}>{block.excerpt}</div>}
				</div>
				<div style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: GROUND, fontSize: 14 }}>{blockIcon(block)}</div>
			</div>
		</foreignObject>
	);
}
