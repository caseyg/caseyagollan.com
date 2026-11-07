import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getGitHubPost, validPostParams } from '$lib/server/github-posts';
import { publishingConfig } from '$lib/server/publishing/config';
import { publicationRevision } from '$lib/server/publishing/publication';
import { ProtocolError } from '$lib/server/publishing/auth';
import { editorSession, editorDestinations, sendEditorDrafts, validateEditorSubmission } from '$lib/server/publishing/syndication-editor';

export const prerender = false;

export const load: PageServerLoad = async ({ request, params, platform, setHeaders, fetch }) => {
 // Native form POSTs send Origin: null under no-referrer; preserve same-site origins.
 setHeaders({ 'cache-control': 'no-store', 'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'referrer-policy': 'same-origin', 'x-robots-tag': 'noindex, nofollow' });
 if (!validPostParams(params)) error(404, 'Post not found');
 const session = await editorSession(request, platform?.env ?? {});
 if (!session) return { signedIn: false as const };
 const config = publishingConfig(platform?.env);
 if (!config) error(503, 'Publishing is unavailable.');
 try {
  const post = await getGitHubPost(params, fetch, config.token, config);
  if (!post) error(404, 'Post not found');
  return { signedIn: true as const, csrf: session.csrf, revision: await publicationRevision(post), title: post.title,
   postUrl: new URL(`/${params.year}/${params.month}/${params.day}/${params.slug}/`, config.me).href,
   destinations: await editorDestinations(config, post) };
 } catch (cause) {
  if (cause instanceof ProtocolError) error(cause.status, cause.message);
  throw cause;
 }
};

export const actions: Actions = {
 default: async ({ request, params, platform, fetch }) => {
  if (!validPostParams(params)) error(404, 'Post not found');
  const session = await editorSession(request, platform?.env ?? {});
  if (!session) return fail(401, { message: 'Sign in to syndicate this post.' });
  // The form has at most two 10 kB drafts, plus session and revision fields.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) {
   const { done, value } = await reader.read(); if (done) break;
   size += value.byteLength;
   if (size > 32768) { await reader.cancel(); return fail(413, { message: 'The drafts are too large.' }); }
   chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return fail(415, { message: 'Submit the syndication form.' });
  const values = new URLSearchParams(new TextDecoder().decode(bytes));
  const drafts = { bluesky: values.get('bluesky') ?? '', mastodon: values.get('mastodon') ?? '' };
  try {
   await validateEditorSubmission(request, session, values.get('csrf'));
   const config = publishingConfig(platform?.env);
   if (!config) error(503, 'Publishing is unavailable.');
   const post = await getGitHubPost(params, fetch, config.token, config);
   if (!post) error(404, 'Post not found');
   const message = await sendEditorDrafts(config, post, values.get('revision') ?? '', values.getAll('targets'), drafts, { gitFetch: fetch, syncOnly: values.get('intent') === 'sync' });
   return { message, drafts, targets: values.getAll('targets') };
  } catch (cause) {
   if (cause instanceof ProtocolError) return fail(cause.status, { message: cause.message, drafts, targets: values.getAll('targets') });
   console.warn(JSON.stringify({ event: 'syndication_editor_failed' }));
   return fail(503, { message: 'Syndication is temporarily unavailable. Reload before trying again.', drafts, targets: values.getAll('targets') });
  }
 }
};
