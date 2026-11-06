# Build optimization results — November 6, 2026

## Applied changes

- Removed the approved Eleventy `archive`, generated `_site`, nested SvelteKit starter, duplicate `src/content`, Eleventy cache, obsolete backups, root GitHub Pages marker/domain duplicates, browser screenshots, Conductor setup/workspace, and WARP link. Approximately 602 MB removed locally; 561 MB was the untracked Conductor workspace. Tracked files remain recoverable from Git history. History was not rewritten.
- Renamed `CLAUDE.md` to `AGENTS.md` and corrected the old Pages instructions. Updated README to describe the current Worker deployment and canonical content submodule.
- Added build-only post parsing reuse through `createPostReader`. The Vite content snapshot and parser changes already in progress were preserved. Runtime and development reads remain uncached; GitHub fallback responses remain uncached.
- Replaced the D3 umbrella import with selection, drag, force, ease, and transition modules. Preserved transition registration via the side-effect import. Declared matching runtime and development-type dependencies; removed unused `d3` and `gray-matter` direct dependencies.
- Updated both Cloudflare triggers and read the settings back. Build command remains `bun run build`; production deploy is `bun run wrangler deploy`; branch deploy is `bun run wrangler versions upload`. Build caching remains enabled. Includes remain `*`; exclusions are `docs/*`, `tests/*`, `.superpowers/*`, `README.md`, `AGENTS.md`, `PLAN.md`, and `TODO.md`. No exclusions were added for deleted site directories. The content submodule pointer, source, assets, dependencies, and configuration still trigger builds.

## Measurements

Local warm builds use the same isolated temporary source snapshot and installed package versions. Each row contains three successful runs in seconds; these small samples describe local work, not guaranteed Cloudflare savings.

| Comparison | Before | After | Median difference |
| --- | --- | --- | --- |
| Cache post parsing | 4.841, 4.956, 4.915 | 4.711, 4.811, 4.776 | 0.139 s faster |
| Narrow D3 imports | 4.678, 4.596, 4.642 | 4.453, 4.415, 4.566 | 0.189 s faster |
| Disable gzip-size reporting | 4.711, 4.811, 4.776 | 4.736, 4.706, 4.913 | 0.040 s faster; not retained |
| Wrangler version startup: npx vs Bun | 0.898, 0.599, 0.636 | 0.362, 0.357, 0.365 | 0.274 s faster |

Instrumentation showed 2,448 post parses without caching versus 34 with caching (72 consumers of the 34-file snapshot). D3 narrowing reduced client modules transformed from 902 to 666; output size was effectively unchanged because tree-shaking already removed unused code. Profiling showed one installed Three.js version; its core and renderer chunks are expected shared output, so no Three.js rewrite was warranted.

The latest sampled live production build before changes took 37.34 seconds from creation to stop, including approximately 14.4 seconds for its build command and 6.9 seconds for deployment. One sampled run waited 51.5 seconds before initialization. Deleting untracked Conductor files does not improve network clone time; the repository's historical Git pack was 11.75 MiB and remains intact.

## Verification

- Production build passes with the normal `bun run build` command.
- Wrangler deploy packaging dry-run passes; production was not deployed by this task.
- All 12 regression tests pass, including build cache reuse and uncached content edits.
- The changed Svelte component compiles for both client and server with zero compiler warnings.
- Svelte check has existing failures: 74 errors / 5 warnings at the initial baseline, 71 errors / 5 warnings after changes. Comparing file/message diagnostic multisets found no new errors. Existing failures concern API response types/binding declarations, graph callback types, Webmentions, and library types/metadata.
- All 74 baseline prerendered HTML paths remain. Final output includes 76 paths, with two additional date/post paths from the concurrent content-parser work. All 374 pre-existing library asset files are byte-identical.
- Browser smoke checks passed on the local Worker preview for the homepage skills graph (8 nodes), rendered 3D library canvas, `/posts/`, `/tag/ai/`, `/2025/09/`, and `/2025/09/30/changelog/`. The date archive currently labels September as August; the date-formatting source was not changed by this task.
- The canonical content submodule pointer remains `521ba3e2c25a623d398de6bc0a9584af59744a17`.

## Local runtime issue encountered

After a concurrent dependency update, macOS rejected the installed workerd executable with `SIGKILL (Code Signature Invalid)`, surfaced by the adapter as `EPIPE`. The signature verified on disk, and a fresh copy of the original signed bytes ran successfully. Replacing the stale inode with a byte-identical copy restored normal local builds. The pinned runtime version and repository configuration were unchanged. Failed runs were excluded from timing comparisons.

## Sources

- Cloudflare live Workers Builds trigger settings and sampled build logs, inspected through the Cloudflare plugin.
- https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/
- https://d3js.org/getting-started
