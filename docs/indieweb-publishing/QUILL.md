# Quill compatibility

The Micropub endpoint accepts Quill JSON and form publishing through the existing authenticated Git-backed publishing flow. Supported posts: every type on the IndieWeb [posts](https://indieweb.org/posts) page except weight. That is notes, Markdown/HTML articles, bookmarks, likes, reposts, quotations, replies, RSVPs, issues, photos, video, audio, events and presentations, checkins, venues, reviews, itineraries, food/drink, reads, watches, listens, plays, jams, collections, exercise and recipes. Each type has its own content folder and archive at `/type/<plural>/`. [proposals/micropub-post-types.md](proposals/micropub-post-types.md) lists the properties each one uses.

- `q=config` advertises post types (with their microformat root, properties and required properties), channels, configured syndication destinations, statuses and the media endpoint when configured. `q=channels` returns the available collection channels.
- `mp-channel` selects channel metadata independently of the post type. `mp-slug` sets the initial slug. Existing dated permalinks stay stable through edits.
- `p3k-content-type: ["text/markdown"]` preserves Markdown source. Plain strings without that marker stay literal text; HTML content objects are sanitized.
- Source queries preserve root microformat types and nested structures. Updates support replace/add/delete with final-document validation and existing revision/scope checks.
- Archives, permalinks, feeds and delivery show structured data, including target links, venue details, ratings, transit legs and food/drink names. Presentation HTML uses the existing HTML and trusted-iframe allowlist; scripts and unsupported embeds are removed.
- Creates may be sent as `multipart/form-data` with `photo`, `video` or `audio` files, which are stored on the media endpoint's bucket after the token is checked.
- Weight and non-public visibility are rejected. Drafts are excluded from the public site, but their source is visible in the public GitHub content repository.

Media uploads and syndication use the existing configured services. This compatibility work does not enable new providers or deploy the site.

## Editing on the site

After the owner signs in with a passkey, dated posts show an Edit link that opens `<post URL>edit/`. Like Quill's `/edit`, the page reads the post with `q=source` and saves a Micropub `update` containing only the changed properties, with `If-Match` so a stale form cannot overwrite a newer revision. The owner session authorizes each request in the Worker; no access token is issued or stored in the browser.

- The Edit link is shown from a browser-local sign-in hint because post pages are static. The session cookie still gates the edit page and every save.
- `q=source` reports explicit Markdown bodies with `p3k-content-type: ["text/markdown"]`. Adding `p3k-content-type=text/markdown` to the query also returns older Markdown bodies as source instead of rendered HTML.
- Published date, slug, photos and structured properties are not editable in the form and are left unchanged.
- Markdown content opens in a rich text editor ([svelte-lexical](https://github.com/umaranis/svelte-lexical)) that reads and writes the same Markdown source; a toggle shows the raw Markdown. The stored source is rewritten only after an edit. Posts whose Markdown the editor cannot reproduce exactly open as source with a warning. Text and HTML content use a plain textarea, which is also the fallback without JavaScript.

## Writing new posts on the site

`/new/` opens a Quill-style composer for the signed-in owner, linked from `/account`. It starts on a note, like a social app's compose box, and a menu next to the close button switches to the editor for each post type Quill offers and this endpoint accepts: every type the endpoint accepts, grouped as Write, Share, Media, Places and plans, and Log. Publishing sends a Micropub `create` request to the site's own endpoint, authorized by the owner session the same way as the edit page, so the result is validated and stored exactly like a post from Quill.

- Only the fields a post type needs are shown. Optional fields (photos, photo by URL, reply-to on notes, location, tags, and slug/date/format) open from icons in the toolbar under the text, and stay open when they hold a value. Without JavaScript every field is shown.
- Photos and videos upload to the media endpoint through `/new/media/`, with alt text per photo. Photos can also be added by URL.
- Location takes a place name or the browser's current position (a `geo:` URI with accuracy).
- Tags, slug, published date and time (in `PUBLISHING_TIMEZONE`), content type (text, Markdown or HTML, with the rich text editor for Markdown) and configured syndication targets are available on every type where they apply.
- `/new/bookmark/?url=…&title=…&selection=…` prefills a bookmark, and the composer's footer offers a bookmarklet that does this for the current page. `in-reply-to`, `like-of` and `repost-of` query parameters prefill the matching editors.

### Drafts

“Save draft” writes the form to `drafts/<id>.json` in a private GitHub repository (`PUBLISHING_DRAFTS_GITHUB_REPO`, default branch `main`, owner `PUBLISHING_GITHUB_OWNER`), not the public content repository. Each file holds the form fields and, when complete, the Micropub request the draft would publish. Drafts are listed in the composer's Drafts menu, and can be reopened, updated (stale saves are rejected), discarded, or published; publishing removes the draft file. If the drafts repository is not configured or is the content repository, the Save draft button is hidden.

Micropub clients that send `post-status: draft` still write to the content repository as before.
