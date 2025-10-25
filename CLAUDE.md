# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Casey Gollan's personal website built with SvelteKit 2, featuring an interactive bio with telescopic text and a 3D library visualization. The site uses `@sveltejs/adapter-cloudflare` for deployment to Cloudflare Pages.

## Development Commands

```bash
# Install dependencies
bun install

# Start development server (Vite - fast HMR, no KV bindings)
bun run dev

# Build for production
bun run build

# Preview with local KV simulation (requires build first)
bun run preview

# Preview with remote production KV (requires build first)
bun run preview:remote

# Deploy to Cloudflare Pages
bun run deploy

# Update library data after adding books to LibraryThing
bun run update-library
```

### Local Development with KV Bindings

**Important**: SvelteKit uses Vite for development, which doesn't load Cloudflare bindings (KV, D1, R2, etc.). To test with KV:

1. **Development** (no KV): `bun run dev` - Use this for fast HMR during development
2. **Local testing with KV**: `bun run preview` - Builds first, then runs `wrangler pages dev` with local KV simulation
3. **Remote KV testing**: `bun run preview:remote` - Builds first, then connects to production KV namespace

The `preview` command uses `wrangler pages dev` which automatically loads bindings from `wrangler.jsonc`.

## Library Update Workflow

When adding new books to the collection:

1. Export JSON from LibraryThing (https://www.librarything.com/export)
2. Save as `librarything_caseygollan.json` in `/utils/`
3. Run `bun install` (if needed for dependencies)
4. Run `bun run update-library`
5. Run ImageOptim on `/static/library/img/` directory

The processing script downloads book covers from OpenLibrary API, validates images, and generates `/static/library/graph.json` for the 3D visualization.

## Architecture

### SvelteKit Structure
- **Framework**: SvelteKit 2 with TypeScript
- **Adapter**: `@sveltejs/adapter-cloudflare` for Cloudflare Pages deployment
- **Runtime**: Bun for local development, Node.js on Cloudflare Pages
- **Routes**:
  - `/` - Home page with telescopic text bio (`src/routes/+page.svelte`)
  - `/library/` - 3D library visualization (`src/routes/library/+page.svelte`)
- **Static Assets**: `/static/` directory (served at root in production)

### Library Visualization (`/library/`)
- **3D Engine**: Three.js via `3d-force-graph` npm package
- **Data Structure**: Force-directed graph with book nodes connected to DDC subject nodes
- **Rendering**: Books as 3D cubes with cover art textures
- **Modes**: Graph mode (3D force layout) and Grid mode (sorted spine view)
- **Grid Sorting**: By acquisition date, publication year, DDC classification, or color
- **Client-side only**: Uses `onMount` and `browser` check for hydration

### Main Site (`/`)
- **Interactive Bio**: Uses `telescopic-text` library (loaded dynamically)
- **Dynamic Import**: External library loaded via dynamic import for SSR compatibility
- **Images**: Book covers stored in `/static/library/img/` with ISBN-based naming

### Data Processing (`/utils/`)
- `librarything-to-graph.js`: Converts LibraryThing export to graph format
- Downloads and validates book cover images
- Outputs to `/static/library/graph.json` and `/static/library/img/`
- Uses `image-size` and `sharp` packages for image processing

## Deployment

- **Platform**: Cloudflare Pages
- **Adapter**: `@sveltejs/adapter-cloudflare`
- **Build Command**: `bun run build`
- **Output Directory**: `.svelte-kit/output/client`
- **Framework Preset**: SvelteKit
- **Node Version**: 20 or higher
- **Build Configuration**: Cloudflare Pages automatically detects SvelteKit and builds using the configured adapter

### Cloudflare MCP Server & Wrangler CLI

The Cloudflare MCP server is available for documentation lookup and deployment management.

**MCP Tools**:
- `search_cloudflare_documentation`: Search Cloudflare docs for Pages, Workers, deployment config, etc.
- `migrate_pages_to_workers_guide`: ALWAYS read this before migrating Pages projects to Workers

**Wrangler CLI Commands**:
```bash
# View deployment logs
npx wrangler pages deployment tail

# View recent deployments
npx wrangler pages deployments list

# Create/update wrangler.toml configuration
# (for Pages projects, most config is in dashboard or svelte.config.js)
npx wrangler pages project list

# Deploy manually (usually done via git push)
npx wrangler pages deploy .svelte-kit/output/client
```

**When to Use Each**:
- **MCP Server**: For searching documentation about Cloudflare features, configuration options, and troubleshooting
- **Wrangler CLI**: For checking deployment logs, viewing deployment status, and manual deployments
- **Dashboard**: For environment variables, custom domains, build settings (primary config location for Pages)

## Svelte MCP Server

You are a Svelte expert tasked to build components and utilities for Svelte developers. If you need documentation for anything related to Svelte you can invoke the tool `get_documentation` with one of the available documentation paths.

Every time you write a Svelte component or module, you MUST:
1. Invoke the `svelte-autofixer` tool with the code
2. Fix any issues or suggestions returned
3. Repeat steps 1-2 until no issues remain

When finalizing code, you can generate a playground link using the `playground-link` tool, which must include an `App.svelte` as the entry point.

## Migration Status

**Current State**: ✅ Migration to SvelteKit 2 with Cloudflare Pages COMPLETE

### What Was Migrated:
- ✅ Home page with telescopic text interactive bio
- ✅ 3D library visualization with all features (graph/grid modes, sorting)
- ✅ Static assets (CNAME, library data, book covers)
- ✅ Library update utility script
- ✅ Build configuration for Cloudflare Pages
- ✅ Posts route with placeholder page (`/posts/`)

### Posts Migration Notes:
The original site used a git submodule for content (`archive/content/`) containing:
- Notes (markdown files with frontmatter)
- Articles, bookmarks, photos, videos
- Generated via Eleventy with collections and date-based organization

**Current Implementation**:
- Placeholder `/posts/` route created in SvelteKit
- Links to GitHub content repository for now
- Ready for future content system integration

**Future Work**:
1. Set up content loading from git submodule or CMS
2. Implement markdown rendering (consider mdsvex)
3. Create RSS feed generation
4. Add date-based archive navigation
5. Migrate IndieWeb features (webmention display)

### What Remains in Archive:
- Old Eleventy site preserved in `/archive/` directory
- Content submodule (separate git repository)
- Accessible alternative HTML (not yet migrated)

## Workflow Guidance

- Always commit .claude-trace logs alongside edits to show how claude was used
- Use Bun for all local development and package management
- Test both routes (`/` and `/library/`) after making changes
- Run `bun run build` to verify production builds succeed