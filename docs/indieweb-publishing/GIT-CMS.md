# Git CMS notes

Try [Sveltia](https://github.com/sveltia/sveltia-cms) before building our own editor. It could edit the same Markdown while Quill uses the Micropub Worker. Both paths must produce compatible files and trigger publication.

Borrow its local draft recovery, stale-edit detection, revision checks, and separate save/deployment status. Its GitHub login doesn't replace IndieAuth. Our R2 credentials will stay in the Worker rather than the browser.

Test disposable files for dated paths, timezone offsets, unknown/nested metadata, alt text, and edits made outside the CMS. Direct Git saves bypass Micropub validation, so shared format checks belong in the commit workflow too.

[Decap](https://github.com/decaporg/decap-cms) is another reference for configurable forms. [Pages CMS](https://github.com/hunvreus/pagescms) has a simple editor, but its current setup requires PostgreSQL.

We reviewed source and documentation; we haven't tested these editors with this site.

[Captured sources and commits](research/INVENTORY.md) · [Sveltia conflict code](https://github.com/sveltia/sveltia-cms/blob/4f8984cca19d687783e5db5333805ff0f099a0a1/src/lib/services/contents/draft/save/conflict.js) · [R2 docs](https://sveltiacms.app/en/docs/media/cloudflare-r2)
