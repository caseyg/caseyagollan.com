# Quill compatibility

The Micropub endpoint accepts Quill JSON and form publishing through the existing authenticated Git-backed publishing flow. Supported posts: notes, Markdown/HTML articles, bookmarks, likes, reposts, replies and RSVPs, photos/video, events and presentations, reviews, itineraries, and food/drink.

- `q=config` advertises post types, channels, configured syndication destinations, statuses and the media endpoint when configured. `q=channels` returns the available collection channels.
- `mp-channel` selects channel metadata independently of the post type. `mp-slug` sets the initial slug. Existing dated permalinks stay stable through edits.
- `p3k-content-type: ["text/markdown"]` preserves Markdown source. Plain strings without that marker stay literal text; HTML content objects are sanitized.
- Source queries preserve root microformat types and nested structures. Updates support replace/add/delete with final-document validation and existing revision/scope checks.
- Archives, permalinks, feeds and delivery show structured data, including target links, venue details, ratings, transit legs and food/drink names. Presentation HTML uses the existing HTML and trusted-iframe allowlist; scripts and unsupported embeds are removed.
- Weight and non-public visibility are rejected. Drafts are excluded from the public site, but their source is visible in the public GitHub content repository.

Media uploads and syndication use the existing configured services. This compatibility work does not enable new providers or deploy the site.
