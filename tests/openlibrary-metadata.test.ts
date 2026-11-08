import {expect, test} from 'bun:test';
import {enrichLibraryMetadata, openLibraryClient, OPEN_LIBRARY_HEADERS} from '../utils/openlibrary-metadata';
import {discoverLibraryCovers, jpegDimensions} from '../utils/openlibrary-covers';
import type {BookMetadata} from '../src/lib/library-metadata';

const now = new Date('2026-11-08T00:00:00Z');
test('batches ISBNs and works, normalizes descriptions and subjects, and reuses saved results', async () => {
	const saved:Record<string,BookMetadata> = {};
	const calls:string[]=[];
	const fetcher=async(path:string)=>{calls.push(path);return path.startsWith('/api/books') ? {
		'ISBN:123':{details:{key:'/books/OL1M',works:[{key:'/works/OL1W'}]}},
		'ISBN:456':{details:{key:'/books/OL2M',description:' Edition description ',subjects:['Art']}}
	} : {status:'ok',result:{'/works/OL1W':{description:{value:' Work description '},subjects:['History']}}};};
	const catalog={'1':{originalisbn:'123',genre:['Nonfiction']},'2':{originalisbn:'456'}};
	await enrichLibraryMetadata(catalog,saved,fetcher,now);
	expect(calls).toHaveLength(2);
	expect(saved['1'].description).toBe('Work description');
	expect(saved['1'].categories).toEqual(['Nonfiction','History']);
	expect(saved['2'].description).toBe('Edition description');
	await enrichLibraryMetadata(catalog,saved,fetcher,new Date('2027-11-08'));
	expect(calls).toHaveLength(2);
});

test('caches genuine misses for 30 days but does not cache API errors', async()=>{
	const saved:Record<string,BookMetadata>={};const catalog={'1':{originalisbn:'123'}};let calls=0;
	const missing=async()=>{calls++;return {};};
	await enrichLibraryMetadata(catalog,saved,missing,now);
	await enrichLibraryMetadata(catalog,saved,missing,new Date(now.getTime()+86400000));
	expect(calls).toBe(1);
	await enrichLibraryMetadata(catalog,saved,missing,new Date(now.getTime()+31*86400000));
	expect(calls).toBe(2);
	const previous=saved['1'].openLibraryCheckedAt;
	await expect(enrichLibraryMetadata(catalog,saved,async()=>{throw new Error('HTTP 429');},new Date('2027-11-08'))).rejects.toThrow('HTTP 429');
	expect(saved['1'].openLibraryCheckedAt).toBe(previous);
});

test('uses identification headers and stops on rate limits',async()=>{
	let init:RequestInit|undefined;
	const client=openLibraryClient((async(_url:unknown,options:RequestInit)=>{init=options;return new Response('',{status:429,headers:{'Retry-After':'60'}});}) as typeof fetch);
	await expect(client('/api/books')).rejects.toThrow('Retry-After: 60');
	expect(init?.headers).toEqual(OPEN_LIBRARY_HEADERS);
});

test('finds a work cover when the edition has none and skips cached discovery',async()=>{
	const saved:Record<string,BookMetadata>={};let calls=0;
	const fetcher=async(path:string)=>{calls++;return path.startsWith('/api/books')?{'ISBN:123':{details:{works:[{key:'/works/OL1W'}]}}}:{status:'ok',result:{'/works/OL1W':{covers:[-1,42]}}};};
	await discoverLibraryCovers({'1':{originalisbn:'123'}},saved,fetcher,async()=>{});
	expect(saved['1'].coverId).toBe(42);
	await discoverLibraryCovers({'1':{originalisbn:'123'}},saved,fetcher,async()=>{});
	expect(calls).toBe(2);
});

test('reads JPEG dimensions and rejects malformed placeholders',()=>{
	expect(jpegDimensions(new Uint8Array([255,216,255,192,0,8,8,2,88,1,144,3]))).toEqual({width:400,height:600});
	expect(jpegDimensions(new Uint8Array([255,216,255,192,0,8]))).toBeNull();
	expect(jpegDimensions(new Uint8Array([0,0,0]))).toBeNull();
});
