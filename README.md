# caseyagollan.com

Casey Gollan's personal website built with SvelteKit 2, featuring an interactive bio with telescopic text and a 3D library visualization.

## Tech Stack

- **Framework**: SvelteKit 2 with TypeScript
- **Runtime**: Bun (local development)
- **Adapter**: `@sveltejs/adapter-cloudflare` for Cloudflare Pages
- **3D Library**: Three.js via `3d-force-graph`
- **Interactive Text**: `telescopic-text`

## Development

Install dependencies:

```sh
bun install
```

Start the development server:

```sh
bun run dev

# or open the app in a new browser tab
bun run dev --open
```

## Building

Create a production build:

```sh
bun run build
```

Preview the production build:

```sh
bun run preview
```

## Library Management

Update the 3D library visualization after adding books to LibraryThing:

1. Export JSON from [LibraryThing](https://www.librarything.com/export)
2. Save as `librarything_caseygollan.json` in `/utils/`
3. Run `bun run update-library`
4. Run ImageOptim on `/static/library/img/` directory

## Deployment

The site deploys to Cloudflare Pages. Connect your GitHub repository to Cloudflare Pages with the following settings:

- **Framework preset**: SvelteKit
- **Build command**: `bun run build`
- **Build output directory**: `.svelte-kit/output/client`
- **Root directory**: `/` (or your workspace directory)
- **Environment variables**: None required

Cloudflare Pages will automatically build and deploy when you push to your main branch.
