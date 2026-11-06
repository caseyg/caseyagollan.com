# IndieWeb publishing

Markdown in Git, media in R2, Micropub on the existing Cloudflare Worker. No D1. Trial Sveltia before building an editor.

- [Plan](DESIGN.md)
- [Preview setup](SETUP.md)
- [CMS notes](GIT-CMS.md)
- [Detailed research](PROJECTS.md)
- [30 specifications](specs/README.md)
- [19 researched repositories](research/INVENTORY.md)
- [Source URLs and hashes](manifest.json)

Research captured November 6, 2026. Snapshots contain selected files, not full clones. Selected publishing paths have unit, local Cloudflare-runtime, and isolated live-preview checks; the research snapshots themselves are references, not a claim of full compatibility.

Refresh from the repository root:

```sh
bun docs/indieweb-publishing/scripts/collect.mjs
bun docs/indieweb-publishing/scripts/index-snapshots.mjs
bun docs/indieweb-publishing/scripts/verify.mjs
```

Review findings after refreshing; upstream code may have changed.

Downloaded repository snapshots under `research/repos/` are local-only and ignored. The inventory and manifest retain provenance; research notes link to commit-pinned upstream source.
