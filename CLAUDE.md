# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Casey Gollan's personal website featuring an interactive bio and a 3D library visualization. The main site uses "telescopic text" for progressive content expansion, with an accessible static alternative. The `/library/` directory contains a 3D interactive book collection browser.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# or
npm run serve

# Update library data after adding books to LibraryThing
npm run update-library
```

## Library Update Workflow

When adding new books to the collection:

1. Export JSON from LibraryThing (https://www.librarything.com/export)
2. Save as `librarything_caseygollan.json` in `/utils/`
3. Run `npm install` (if needed for dependencies)
4. Run `npm run update-library`
5. Run ImageOptim on `/library/img/` directory

The processing script downloads book covers from OpenLibrary API, validates images, and generates `/library/graph.json` for the 3D visualization.

## Architecture

### Library Visualization (`/library/`)
- **3D Engine**: Three.js via `3d-force-graph` library
- **Data Structure**: Force-directed graph with book nodes connected to DDC subject nodes
- **Rendering**: Books as 3D cubes with cover art textures
- **Modes**: Graph mode (3D force layout) and Grid mode (sorted spine view)
- **Grid Sorting**: By acquisition date, publication year, or DDC classification

### Main Site (Root)
- **Interactive Bio**: Uses `telescopic-text` library for expandable content
- **Accessibility**: Separate static HTML version at `index-accessible.html`
- **Images**: Book covers stored in `/library/img/` with ISBN-based naming

### Data Processing (`/utils/`)
- `librarything-to-graph.js`: Converts LibraryThing export to graph format
- Downloads and validates book cover images
- Uses `image-size` package to get dimensions for proper 3D rendering

## Deployment

Static site hosted on GitHub Pages with custom domain (CNAME file). No build process required - serves files directly.

## Workflow Guidance

- Always commit .claude-trace logs alongside edits to show how claude was used