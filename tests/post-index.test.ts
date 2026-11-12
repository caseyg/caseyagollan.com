import { test, expect } from 'bun:test';
import { rollupIndexPosts, getPostsByDay, indexContentUrl, getPostPermalink, type Post } from '../src/lib/posts-types';
import { parsePost } from '../src/lib/server/parse-post';
import { renderPostDetails } from '../src/lib/utils/post-details';

const target = 'https://bsky.app/profile/did:plc:author/post/123';
const like: Post = {type:'like',date:'2025-07-11T00:49:35-04:00',slug:'123',content:'',filePath:'likes/123.md',properties:{'like-of':[target]}};
const repost: Post = {...like,type:'repost',slug:'123-repost',date:'2025-07-11T00:49:38-04:00',properties:{'repost-of':[target]}};

test('indexes roll up like and repost while retaining dates, both permalinks, and original records',()=>{
 const before = structuredClone([repost,like]);
 const [post] = rollupIndexPosts([repost,like]);
 expect(rollupIndexPosts([repost,like])).toHaveLength(1);
 expect(post.date).toBe(repost.date);
 expect(post.indexActivities?.map(({type,date,permalink})=>({type,date,permalink}))).toEqual([
  {type:'like',date:like.date,permalink:'/2025/07/11/123/'},
  {type:'repost',date:repost.date,permalink:'/2025/07/11/123-repost/'}
 ]);
 expect(renderPostDetails(post)).toContain('Liked and reposted');
 expect(renderPostDetails(post)).toContain('u-like-of u-repost-of');
 expect([repost,like]).toEqual(before);
 expect(rollupIndexPosts([like,repost])[0].date).toBe(repost.date);
 expect(getPostsByDay([like,repost]).get('2025-07-11')).toHaveLength(1);
});

test('different targets, commentary, multiple targets, and type-only indexes stay separate',()=>{
 for (const other of [
  {...repost,properties:{'repost-of':[target+'other']}},
  {...repost,content:'My commentary'},
  {...repost,properties:{'repost-of':[target,target+'other']}}
 ]) expect(rollupIndexPosts([like,other])).toHaveLength(2);
 expect(rollupIndexPosts([like])).toEqual([like]);
});

test('rollups spanning local days appear once under the latest action date',()=>{
 const later = {...repost,date:'2025-07-12T00:01:00-04:00'};
 const grouped = getPostsByDay([later,like]);
 expect([...grouped.keys()]).toEqual(['2025-07-12']);
 expect(grouped.get('2025-07-12')).toHaveLength(1);
});

test('a combined card renders its saved social preview exactly once',()=>{
 const snapshot = {version:1 as const,url:target,platform:'bluesky' as const,
  author:{name:'Author',handle:'author.example',url:'https://bsky.app/profile/author.example'},
  published:like.date,fetchedAt:like.date,html:'<p>Shared preview</p>',images:[]};
 const [post] = rollupIndexPosts([{...repost,socialSnapshots:[snapshot]},{...like,socialSnapshots:[snapshot]}]);
 expect(renderPostDetails(post).match(/Shared preview/g)).toHaveLength(1);
 expect(post.indexActivities).toHaveLength(2);
});

test('same-kind activities can share an index card while keeping every permalink',()=>{
 const other = {...like,slug:'second-like',date:'2025-07-12T12:00:00-04:00'};
 const [post] = rollupIndexPosts([like,other]);
 expect(post.indexActivities).toHaveLength(2);
 expect(renderPostDetails(post)).not.toContain('Liked and reposted');
 expect(renderPostDetails(post)).toContain('Liked');
});

test('content URL normalization removes tracking but preserves meaningful query parameters',()=>{
 expect(indexContentUrl('https://example.com/article/?utm_source=bsky#section')).toBe('https://example.com/article');
 expect(indexContentUrl('https://example.com/article?id=1')).not.toBe(indexContentUrl('https://example.com/article?id=2'));
 expect(indexContentUrl('javascript:alert(1)')).toBeUndefined();
 expect(indexContentUrl('https://user:pass@example.com/article')).toBeUndefined();
});

test('the four July 2026 activities roll up by article across networks and dates',async()=>{
 const files = [
  ['reposts','2026-07-13-3mqhyninnjs26.md'],
  ['reposts','2026-07-13-116907958420910231.md'],
  ['likes','2026-11-06-116907958420910231.md'],
  ['reposts','2026-07-13-3mqhjvjsm2k2t.md']
 ];
 const posts = await Promise.all(files.map(async([folder,name])=>parsePost(await Bun.file(`${import.meta.dir}/../content/${folder}/${name}`).text(),folder,name)));
 const [post,...rest] = rollupIndexPosts(posts);
 expect(rest).toHaveLength(0);
 expect(post.date).toBe('2026-07-13T13:10:06-04:00');
 expect(post.indexActivities).toHaveLength(4);
 expect(new Set(post.indexActivities!.map(a=>a.network))).toEqual(new Set(['Mastodon','Bluesky']));
 expect(post.indexActivities!.map(a=>a.permalink)).toContain('/2026/07/12/116907958420910231/');
 expect(post.socialSnapshots).toHaveLength(1);
 expect(post.socialSnapshots![0].preview?.image).toBeDefined();
 expect(renderPostDetails(post).match(/social-link-preview"/g)).toHaveLength(1);
 expect([...getPostsByDay(posts).keys()]).toEqual(['2026-07-13']);
 expect(rollupIndexPosts([post])).toEqual([post]);
 expect(rollupIndexPosts([...posts].reverse())).toHaveLength(1);
 expect(rollupIndexPosts([{...posts[0],content:'My additional commentary'},...posts.slice(1)])).toHaveLength(2);
});

test.each([
 ['2025-07-11','3ltkntgos2k2v','3ltkntgos2k2v-repost'],
 ['2024-04-18','112292639613071937-like','112292639613071937']
])('reported pair %s renders once with both actions', async(date,likeSlug,repostSlug)=>{
 const posts = await Promise.all([
  ['likes',`${date}-${likeSlug}.md`],
  ['reposts',`${date}-${repostSlug}.md`]
 ].map(async([folder,name])=>parsePost(await Bun.file(`${import.meta.dir}/../content/${folder}/${name}`).text(),folder,name)));
 const rolled = rollupIndexPosts(posts);
 expect(rolled).toHaveLength(1);
 expect(rolled[0].indexActivities).toHaveLength(2);
 expect(renderPostDetails(rolled[0]).match(/Liked and reposted/g)).toHaveLength(1);
 expect(posts.map(p=>renderPostDetails(p)).join('')).not.toContain('Liked and reposted');
});

const threadRoot = 'https://bsky.app/profile/did:plc:author/post/root';
function threadLike(id: string, published: string, root = threadRoot): Post {
 const url = `https://bsky.app/profile/author.example/post/${id}`;
 return {...like,slug:id,filePath:`likes/${id}.md`,properties:{'like-of':[url]},socialSnapshots:[{
  version:1,url,platform:'bluesky',author:{name:'Author',handle:'@author.example',url:'https://bsky.app/profile/author.example'},
  published,fetchedAt:like.date,html:`<p>${id}</p>`,images:[],
  thread:{post:`https://bsky.app/profile/did:plc:author/post/${id}`,root,parent:root}
 }]};
}
test('different liked posts in a saved Bluesky thread group in conversation order without mutating records',()=>{
 const first = threadLike('root','2026-11-11T18:29:00Z');
 const second = {...threadLike('second','2026-11-11T18:31:00Z'),date:'2026-11-12T00:01:00-05:00'};
 const before = structuredClone([second,first]);
 const grouped = rollupIndexPosts([second,first]);
 expect(grouped).toHaveLength(1);
 expect(grouped[0].indexThreadPosts?.map(p=>p.slug)).toEqual(['root','second']);
 expect(grouped[0].date).toBe(second.date);
 expect([second,first]).toEqual(before);
 expect(rollupIndexPosts(grouped)).toEqual(grouped);
 expect([...getPostsByDay([second,first]).keys()]).toEqual(['2026-11-12']);
 expect(rollupIndexPosts([first])).toEqual([first]);
});
test('replies retain their content and media alongside likes and reposts in the conversation',()=>{
 const first = threadLike('root','2026-11-11T18:29:00Z');
 const reaction = {...threadLike('second','2026-11-11T18:31:00Z'),type:'repost' as const,properties:{'repost-of':['https://bsky.app/profile/author.example/post/second']}};
 const reply:Post = {...first,type:'reply',slug:'reply',filePath:'replies/reply.md',date:'2026-11-11T18:32:00Z',content:'My own reply',photo:[{url:'https://example.com/photo.jpg',alt:'Photo'}],properties:{'in-reply-to':[first.socialSnapshots![0].url]}};
 const [group] = rollupIndexPosts([reply,reaction,first]);
 expect(group.indexThreadPosts?.map(p=>p.type)).toEqual(['like','repost','reply']);
 expect(group.indexThreadPosts?.[2]).toEqual(reply);
});
test('unrelated likes and missing thread metadata stay separate regardless of author or timing',()=>{
 const first = threadLike('root','2026-11-11T18:29:00Z');
 const unrelated = threadLike('other','2026-11-11T18:30:00Z','https://bsky.app/profile/did:plc:author/post/other');
 expect(rollupIndexPosts([first,unrelated])).toHaveLength(2);
 const missing = threadLike('second','2026-11-11T18:31:00Z');
 delete missing.socialSnapshots![0].thread;
 expect(rollupIndexPosts([first,missing])).toHaveLength(2);
});

test('a reply groups with an existing combined like/repost card',()=>{
 const parent = threadLike('root','2026-11-11T18:29:00Z');
 const repost = {...parent,type:'repost' as const,slug:'root-repost',filePath:'reposts/root.md',properties:{'repost-of':parent.properties!['like-of']}};
 const reply:Post = {...parent,type:'reply',slug:'reply',filePath:'replies/reply.md',content:'My response',properties:{'in-reply-to':parent.properties!['like-of']}};
 const [group] = rollupIndexPosts([parent,repost,reply]);
 expect(group.indexThreadPosts).toHaveLength(2);
 expect(group.indexThreadPosts?.find(p=>p.type!=='reply')?.indexActivities).toHaveLength(2);
 expect(group.indexThreadPosts?.find(p=>p.type==='reply')?.content).toBe('My response');
});

test('Paul Frazee co-op likes appear in one conversation group in publication order',async()=>{
 const slugs = ['3n22lnwmruk2o','3n22lkwuo4c2o'];
 const posts = await Promise.all(slugs.map(async slug=>parsePost(await Bun.file(`${import.meta.dir}/../content/likes/2026-11-11-${slug}.md`).text(),'likes',`2026-11-11-${slug}.md`)));
 const grouped = rollupIndexPosts(posts);
 expect(grouped).toHaveLength(1);
 expect(grouped[0].indexThreadPosts?.map(p=>p.slug)).toEqual([...slugs].reverse());
 expect(grouped[0].indexThreadPosts?.map(p=>getPostPermalink(p))).toEqual(['/2026/11/11/3n22lkwuo4c2o/','/2026/11/11/3n22lnwmruk2o/']);
});
