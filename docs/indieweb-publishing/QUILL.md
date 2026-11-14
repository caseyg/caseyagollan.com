# Quill compatibility

The Micropub endpoint accepts Quill JSON and form publishing through the existing authenticated Git-backed publishing flow. Supported posts: notes, Markdown/HTML articles, bookmarks, likes, reposts, replies and RSVPs, photos/video, events and presentations, reviews, itineraries, and food/drink.

- `q=config` advertises post types, channels, configured syndication destinations, statuses and the media endpoint when configured. `q=channels` returns the available collection channels.
- `mp-channel` selects channel metadata independently of the post type. `mp-slug` sets the initial slug. Existing dated permalinks stay stable through edits.
- `p3k-content-type: ["text/markdown"]` preserves Markdown source. Plain strings without that marker stay literal text; HTML content objects are sanitized.
- Source queries preserve root microformat types and nested structures. Updates support replace/add/delete with final-document validation and existing revision/scope checks.
- Archives, permalinks, feeds and delivery show structured data, including target links, venue details, ratings, transit legs and food/drink names. Presentation HTML uses the existing HTML and trusted-iframe allowlist; scripts and unsupported embeds are removed.
- Weight and non-public visibility are rejected. Drafts are excluded from the public site, but their source is visible in the public GitHub content repository.

Media uploads and syndication use the existing configured services. This compatibility work does not enable new providers or deploy the site.

## Editing on the site

After the owner signs in with a passkey, dated posts show an Edit link that opens `<post URL>edit/`. Like Quill's `/edit`, the page reads the post with `q=source` and saves a Micropub `update` containing only the changed properties, with `If-Match` so a stale form cannot overwrite a newer revision. The owner session authorizes each request in the Worker; no access token is issued or stored in the browser.

- The Edit link is shown from a browser-local sign-in hint because post pages are static. The session cookie still gates the edit page and every save.
- `q=source` reports explicit Markdown bodies with `p3k-content-type: ["text/markdown"]`. Adding `p3k-content-type=text/markdown` to the query also returns older Markdown bodies as source instead of rendered HTML.
- Published date, slug, photos and structured properties are not editable in the form and are left unchanged.
- Markdown content opens in a rich text editor ([svelte-lexical](https://github.com/umaranis/svelte-lexical)) that reads and writes the same Markdown source; a toggle shows the raw Markdown. The stored source is rewritten only after an edit. Posts whose Markdown the editor cannot reproduce exactly open as source with a warning. Text and HTML content use a plain textarea, which is also the fallback without JavaScript.
