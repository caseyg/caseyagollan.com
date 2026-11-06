# IndieWeb publishing

Markdown in Git, media in R2, Micropub on the existing Cloudflare Worker. No D1. Trial Sveltia before building an editor.

- [Plan](DESIGN.md)
- [CMS notes](GIT-CMS.md)
- [Detailed research](PROJECTS.md)
- [30 specifications](specs/README.md)
- [19 repository snapshots](research/INVENTORY.md)
- [Source URLs and hashes](manifest.json)

Research captured November 6, 2026. Snapshots contain selected files, not full clones. Runtime compatibility remains untested.

Refresh from the repository root:

```sh
bun docs/indieweb-publishing/scripts/collect.mjs
bun docs/indieweb-publishing/scripts/index-snapshots.mjs
bun docs/indieweb-publishing/scripts/verify.mjs
```

Review findings after refreshing; upstream code may have changed.
