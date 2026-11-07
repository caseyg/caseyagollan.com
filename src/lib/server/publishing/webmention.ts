import { fromHtml } from 'hast-util-from-html';
import type { Root, Element } from 'hast';
import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
export { DeliveryError } from './public-fetch';
function endpoint(value: string, base: string): string {return publicUrl(new URL(value,base).href).href;}
export function checkDeliveryResponse(response: Response): void {
 if(!response.ok) throw new DeliveryError(`Delivery HTTP ${response.status}`,response.status===408 || response.status===425 || response.status===429 || response.status>=500);
}
export async function discoverWebmention(target: string, fetcher: PublicFetcher=safePublicFetch): Promise<string|undefined> {
 publicUrl(target);
 const response=await fetcher(target,{headers:{accept:'text/html, application/xhtml+xml'}});checkDeliveryResponse(response);
 const base=response.url || target;publicUrl(base);
 // Link field values are split only at commas outside quoted strings and URI references.
 const links=(response.headers.get('link')??'').match(/<[^>]*>(?:[^,"<]|"[^"]*")*/g)??[];
 for(const link of links) {
  const href=link.match(/^<([^>]*)>/)?.[1];
  const rel=link.match(/;\s*rel\s*=\s*(?:"([^"]*)"|([^;\s,]+))/i);
  if(href && (rel?.[1]??rel?.[2]??'').toLowerCase().split(/\s+/).includes('webmention')) return endpoint(href,base);
 }
 const tree=fromHtml(await response.text());
 function visit(node: Root|Element|Root['children'][number]): string|undefined {
  if(node.type==='element' && ['a','link'].includes(node.tagName)) {
   const rel=node.properties.rel; const tokens=Array.isArray(rel)?rel:String(rel??'').split(/\s+/);
   if(tokens.some(r=>String(r).toLowerCase()==='webmention') && typeof node.properties.href==='string') return endpoint(node.properties.href,base);
  }
  if('children' in node) for(const child of node.children) { const found=visit(child);if(found)return found; }
 }
 return visit(tree);
}
export async function sendWebmention(source:string,target:string,fetcher:PublicFetcher=safePublicFetch):Promise<void> {
 publicUrl(source);const destination=await discoverWebmention(target,fetcher);
 if(!destination) throw new DeliveryError('Target has no Webmention endpoint',false);
 const response=await fetcher(destination,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({source,target})});checkDeliveryResponse(response);
}
