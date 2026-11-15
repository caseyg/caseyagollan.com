# Agent guidance

Casey Gollan's personal website uses SvelteKit 2, Svelte 5, TypeScript, Vite, and Bun. Production is a Cloudflare Worker with static assets, not Pages. Use the existing Wrangler configuration and pinned dependencies.

## Commands

- `bun install`: install dependencies.
- `bun run dev`: fast Vite development; no Cloudflare bindings.
- `bun test`: regression tests.
- `bun run check`: Svelte/TypeScript diagnostics. Existing errors remain; record the baseline and report new failures separately.
- `bun run build`: initialize the content submodule, then build with Vite.
- `bun run preview`: build and start Wrangler with local KV/R2 bindings.
- `bun run preview:remote`: build and connect to remote bindings; use only when remote resource access is intended.
- `bun run deploy`: build and change production. For packaging checks, use `bun run wrangler deploy --dry-run` instead.
- `bun run update-library`: process the LibraryThing export into library data and covers.

Use Bun for package management and local scripts. Run tests and a production build for code changes. Check the homepage and library after visualization changes, and posts/tag/date routes after content changes.

## Architecture

- `src/routes/+page.svelte`: interactive bio and homepage.
- `src/lib/components/SkillsGraph.svelte`: D3 skills visualization.
- `src/routes/library/[[isbn]]/`: Three.js book graph and detail view.
- `src/app.css`: design tokens (color, type scale, space, radius, motion) and global base styles. Use tokens instead of literal values.
- `src/lib/components/ui/`: presentational primitives (`Page`, `PageHeader`, `Heading`, `Button`, `Icon`, `Chip`, `ToggleChip`, `SegmentedPill`, `SelectMenu`, `Popover`, `TextField`, `Checkbox`, `CheckboxGroup`, `Switch`, `Notice`, `Section`, `Prose`, ...). Interactive ones are built on ui-sdk. See "UI work" below.
- `src/lib/components/posts/`: post components built from the primitives; routes render feeds with `PostFeed`.
- `.storybook/` and `*.stories.{ts,svelte}`: Storybook, published at `/storybook/`. Add a story for each new component; `Foundations/Tokens` documents the tokens.
- `src/lib/posts.ts`: Vite-bundled Markdown snapshot; shared parsing is limited to production builds.
- `src/lib/server/`: shared Markdown parser and server-side content helpers.
- `src/lib/utils/htmlToMarkdown.ts`: posts are stored as Markdown by default. Imported (PESOS) and edited HTML is converted when `sameRendering` confirms the Markdown renders identically; otherwise it stays HTML. `utils/convert-html-content.ts` applies the same rule to the content repository.
- `src/lib/components/composer/` and `src/lib/components/editor/`: shared composer parts (`ComposerBar`, `ComposerToolbar`, `FrontmatterProperties`, with `Button` and `Icon` from `ui/`) used by `/new` and the post editor. The rich editor (`MarkdownEditor`, Lexical) reads post figures (`<figure>` HTML, see `src/lib/markdown-figure.ts`) into `FigureNode` blocks drawn by `EditableFigure`, and writes untouched figures back byte for byte.
- `content/`: canonical Git submodule. Preserve it; do not add another copy under `src/`.
- `static/library/`: generated library dataset and cover images.
- `utils/librarything-to-graph.js`: library import utility; input is `utils/librarything_caseygollan.json`.
- `wrangler.jsonc`: Worker entry point, assets, domain route, KV, and R2 bindings.
- `.svelte-kit/cloudflare/`: generated Worker and assets; never edit or commit generated output.

Cloudflare builds use `bun run build` followed by Wrangler deployment or version upload. Build caching and watch exclusions are configured on Cloudflare build triggers; see README.md.

## UI work: component-first, atomic design

Every UI change goes through the design system. Do not style a route or page directly.

1. **Find the component first.** Before touching markup or CSS, look for the existing component in `src/lib/components/` and in Storybook (`bun run storybook`, port 6006). Change that component, or extend it with a prop or variant, rather than adding a one-off style at the call site.
2. **Build on ui-sdk.** Interactive components wrap `@ui-sdk/svelte` (Menu, Popover, Button, SegmentedControl, Checkbox, Switch, Field/Input/Textarea, Toolbar, Avatar, Dialog, Pagination) in `src/lib/components/ui/`. Before using ui-sdk, follow the `ui-sdk` skill (`.agents/skills/ui-sdk`) and read `node_modules/@ui-sdk/svelte/docs/llms.txt`, then only the component pages you need; for a component ui-sdk doesn't ship, search `docs/core.md` by heading and read `docs/rendering.md`. Never write `role="menu"`, `"dialog"`, `"toolbar"`, `"switch"` and the like by hand. Style parts through `data-slot` and state attributes (`data-open`, `data-checked`, `data-highlighted`); popups open in the top layer, so they need no z-index. Navigation stays plain links.
3. **Build up by atomic level.** Compose each level only from the levels below it:
   - **Atoms** (`src/lib/components/ui/`, Storybook `Primitives/*`): `Button`, `Icon`, `Chip`, `ToggleChip`, `Count`, `Avatar`, `TextField`, `Checkbox`, `Switch`, `Heading`. Tokens from `src/app.css` only; no layout or data knowledge.
   - **Molecules** (`ui/` and feature folders): small groups of atoms with one job, such as `SegmentedPill`, `SelectMenu`, `Popover`, `CheckboxGroup`, `Pagination`, `PostMeta`, `PostTitle`.
   - **Organisms** (`posts/`, `composer/`, `editor/`, top-level `components/`, Storybook `Posts/*`, `Composer/*`, `Site/*`): self-contained sections such as `PostCard`, `PostFeed`, `Nav`, `Search`, `ComposerBar`.
   - **Templates** (`Page`, `PageHeader`, `Section`, `PostsLayout`): page structure with slots, no route data.
   - **Pages** (`src/routes/**/+page.svelte`): load data and arrange templates and organisms. Routes hold no reusable markup and no `<style>` beyond one-off layout glue.
4. **Update Storybook in the same change.** Every new or changed component needs a story covering its new props, variants, and states (empty, loading, error, long content, mobile where relevant). Put the story next to the component (`Name.stories.ts` or `Name.stories.svelte`) under the matching Storybook group. If a token changes, update `Foundations/Tokens`.
5. **Promote, don't duplicate.** If a second place needs the same pattern, extract it into a component at the right level and replace both usages.
6. **Verify.** Run `bun run build-storybook` (or check `bun run storybook`) alongside tests and the production build, and look at the changed stories and the routes that use them.

## Editing and verification

- Inspect the working tree and preserve unrelated in-progress edits.
- Keep credentials out of source, logs, and commits. Local environment files are ignored.
- Preserve local dates, metadata, media, permalink behavior, and GitHub fallback behavior when changing post parsing.
- Do not cache mutable development content or fallback network responses across requests.
- Do not restore deleted archives, starter apps, generated output, Conductor workspaces, or browser screenshots to the repository.
- When editing Svelte, use `svelte-autofixer` if available; otherwise validate with the installed Svelte compiler and project checks.
- Verify deployed behavior directly before claiming a production fix; a build or upload alone is insufficient.
