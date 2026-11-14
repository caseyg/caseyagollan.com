const LINK = 'app.bsky.richtext.facet#link';
const MENTION = 'app.bsky.richtext.facet#mention';
const TAG = 'app.bsky.richtext.facet#tag';
const escape = (v: string) => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** Web links only: never javascript:, data: or credentialed URLs. */
export function webHref(value: unknown): string {
 if (typeof value !== 'string') throw new Error('Invalid link');
 const url = new URL(value);
 if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid link');
 return url.href;
}

/** Link destinations named by facets, including ones whose byte ranges are missing. */
export function blueskyFacetLinks(facets: unknown): string[] {
 if(!Array.isArray(facets)) return [];
 return facets.flatMap((f: any)=>(Array.isArray(f?.features) ? f.features : []).filter((x: any)=>x?.$type === LINK && typeof x.uri === 'string').map((x: any)=>x.uri as string));
}

/**
 * Render post text with its facets applied, so Bluesky's shortened link labels point at the
 * full URL and mentions/tags link to Bluesky. AT Protocol facet offsets count UTF-8 bytes,
 * not JavaScript characters. Returns the links that were placed in the text.
 */
export function blueskyRichText(text: string, facets: unknown): { html: string; links: string[] } {
 const bytes = new TextEncoder().encode(text);
 const decoder = new TextDecoder('utf-8', {fatal:true});
 const links: string[] = [];
 let end = 0, html = '';
 if(Array.isArray(facets)) for(const facet of [...facets].sort((a,b)=>(a?.index?.byteStart ?? 0)-(b?.index?.byteStart ?? 0))) {
  const start = facet?.index?.byteStart, stop = facet?.index?.byteEnd;
  if(!Number.isInteger(start) || !Number.isInteger(stop) || start < end || stop <= start || stop > bytes.length) continue;
  const feature = Array.isArray(facet.features) ? facet.features.find((f:any)=>[LINK,MENTION,TAG].includes(f?.$type)) : undefined;
  let href: string;
  try {
   if(feature?.$type === LINK) href = webHref(feature.uri);
   else if(feature?.$type === MENTION && typeof feature.did === 'string' && /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/.test(feature.did)) href = `https://bsky.app/profile/${feature.did}`;
   else if(feature?.$type === TAG && typeof feature.tag === 'string') href = `https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`;
   else continue;
   const gap = decoder.decode(bytes.slice(end,start));
   const label = decoder.decode(bytes.slice(start,stop));
   html += escape(gap) + `<a href="${escape(href)}">${escape(label)}</a>`;
   if(feature.$type === LINK) links.push(feature.uri);
   end = stop;
  } catch { /* Ignore malformed facets, preserving the source text. */ }
 }
 html += escape(decoder.decode(bytes.slice(end)));
 return { html: html.split(/\n{2,}/).map(paragraph=>`<p>${paragraph.replace(/\n/g,'<br>')}</p>`).join(''), links };
}

export function blueskyHtml(text: string, facets: unknown): string {
 return blueskyRichText(text, facets).html;
}
