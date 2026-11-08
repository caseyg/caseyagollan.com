import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {unstable_readConfig} from 'wrangler';
import {openLibraryClient, OPEN_LIBRARY_HEADERS, type CatalogBook} from './openlibrary-metadata';
import {discoverLibraryCovers, jpegDimensions} from './openlibrary-covers';
import type {BookMetadata} from '../src/lib/library-metadata';

const path='static/library/metadata.json';
const saved:Record<string,BookMetadata>=JSON.parse(await readFile(path,'utf8'));
const catalog:Record<string,CatalogBook>=JSON.parse(await readFile('utils/librarything_caseygollan.json','utf8'));
const graph=JSON.parse(await readFile('static/library/graph.json','utf8'));
const config=unstable_readConfig({config:resolve('wrangler.jsonc')});
const bucket=config.r2_buckets.find(binding=>binding.binding==='PUBLISHING_MEDIA')?.bucket_name;
const base=config.vars.PUBLISHING_MEDIA_BASE_URL;
const account=Bun.env.CLOUDFLARE_ACCOUNT_ID,token=Bun.env.CLOUDFLARE_API_TOKEN;
if (!bucket || typeof base!=='string' || !account || !token) throw new Error('Existing R2 bucket, public base URL, and Cloudflare credentials required');
let saving = Promise.resolve();
function checkpoint(){saving=saving.then(async()=>{await writeFile(`${path}.tmp`,JSON.stringify(saved,null,2)+'\n');await rename(`${path}.tmp`,path);});return saving;}
await discoverLibraryCovers(catalog,saved,openLibraryClient(),checkpoint);
let stored=0,missing=0,smaller=0;
let nextRequest=0;
async function storeCover(book: any) {
	const entry=saved[String(book.b)];
	if(!entry?.coverId || entry.coverUrl || (Date.now()-Date.parse(entry.coverDownloadCheckedAt??'')<30*86400000))return;
	const key=`library/covers/openlibrary-${entry.coverId}-L.jpg`;
	const url=new URL(key,base).href;
	// A public HEAD also recovers from an interrupted run after the upload.
	const exists=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)});
	if(exists.ok){entry.coverUrl=url;await checkpoint();return;}
	if(exists.status!==404)throw new Error(`R2 public check failed: ${exists.status}`);
	let response!: Response;
	for (let attempt=0; attempt<3; attempt++) {
		const wait = Math.max(0,nextRequest-Date.now());
		nextRequest=Math.max(Date.now(),nextRequest)+500;
		if(wait)await Bun.sleep(wait);
		response=await fetch(`https://covers.openlibrary.org/b/id/${entry.coverId}-L.jpg?default=false`,{headers:OPEN_LIBRARY_HEADERS,signal:AbortSignal.timeout(30000)});
		if (![502,503,504].includes(response.status) || attempt===2) break;
		console.warn(`Cover ${entry.coverId}: HTTP ${response.status}; retrying`);
		await response.body?.cancel();
		await Bun.sleep(1000*2**attempt);
	}

	if(response.status===404){missing++;entry.coverDownloadCheckedAt=new Date().toISOString();await checkpoint();return;}
	if(!response.ok)throw new Error(`Cover download HTTP ${response.status}; leaving this book uncached`);
	const bytes=new Uint8Array(await response.arrayBuffer());
	if(bytes.length>10*1024*1024)throw new Error('Cover exceeds 10 MB');
	const size=jpegDimensions(bytes);
	if(!size || size.width<=1 || size.height<=1)throw new Error('Invalid JPEG cover');
	// Only replace an existing cover when the image actually has more pixels.
	if(book.x && book.z && size.width*size.height<=book.x*book.z){smaller++;entry.coverDownloadCheckedAt=new Date().toISOString();await checkpoint();return;}
	const upload=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/${key}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable'},body:bytes,signal:AbortSignal.timeout(30000)});
	if(!upload.ok)throw new Error(`R2 upload HTTP ${upload.status}`);
	entry.coverUrl=url;entry.coverWidth=size.width;entry.coverHeight=size.height;
	await checkpoint();stored++;
	if(stored%20===0)console.log(`Stored ${stored} larger covers; ${missing} missing; ${smaller} not larger`);
}
const books=graph.nodes.filter((node:any)=>node.g==='book');
let cursor=0, failures=0, stopped=false;
await Promise.all(Array.from({length:3},async()=>{
	while(cursor<books.length && !stopped) {
		const book=books[cursor++];
		try { await storeCover(book); }
		catch(error) {
			failures++;
			console.error(`Book ${book.b}: ${error}`);
			// Preserve successful uploads and leave failed books uncached for the next run.
			if(String(error).includes('429') || String(error).includes('R2')) stopped=true;
		}
	}
}));
if(failures){console.error(`${failures} covers failed; saved covers are preserved.`);process.exitCode=1;}
console.log(`Stored ${stored} larger covers; ${missing} missing; ${smaller} not larger. Total cached: ${Object.values(saved).filter(entry=>entry.coverUrl).length}`);
