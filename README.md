# caseyagollan.com

Casey Gollan's personal website featuring an interactive bio with telescopic text and a 3D interactive library visualization.

## Features

### Interactive Bio
- **Telescopic Text**: Progressive content expansion for an engaging reading experience
- **Accessible Alternative**: Static HTML version available at `index-accessible.html`
- **Responsive Design**: Works across devices and screen sizes

### 3D Library Visualization (`/library/`)
- **Interactive 3D Browser**: Explore a personal book collection in 3D space
- **Two Viewing Modes**:
  - **Graph Mode**: Force-directed layout connecting books to DDC subject nodes
  - **Grid Mode**: Organized spine view with multiple sorting options
- **Sorting Options**: By acquisition date, publication year, or Dewey Decimal Classification
- **Dynamic Loading**: Book covers rendered as 3D textures on cube objects
- **Built with Three.js**: Uses `3d-force-graph` for physics-based visualization

## Technology Stack

- **Static Site Generator**: [11ty (Eleventy)](https://www.11ty.dev/)
- **3D Graphics**: Three.js via `3d-force-graph` library
- **Content Management**: Git submodule for content separation
- **Styling**: Sass for CSS preprocessing
- **Plugins**:
  - RSS feed generation
  - WebC components
  - Webmentions caching
  - Automatic embeds (oEmbed, Open Graph)

## Development

```bash
# Install dependencies
npm install

# Start development server with live reload
npm run dev
# or use a simple static server
npm run serve

# Build for production
npm run build

# Update content submodule to latest
npm run update-content
```

The development server runs on `http://localhost:8080`.

## Content Management

The `content` directory is a git submodule pointing to the [caseyagollan-content](https://github.com/caseyg/caseyagollan-content) repository.

```bash
# Quick update (pulls latest content)
npm run update-content

# Manual update
git submodule update --remote --merge

# Initialize submodule (first time setup)
git submodule update --init --recursive
```

## Library Management

### Adding New Books

When adding books to LibraryThing:

1. Export from [LibraryThing](https://www.librarything.com/export) in JSON format
2. Save as `librarything_caseygollan.json` in `/utils/`
3. Run `npm install` (if dependencies need updating)
4. Run `npm run update-library`
5. Optimize images with ImageOptim on `/library/img/` directory

### How It Works

The `librarything-to-graph.js` script:
- Converts LibraryThing export to graph data structure
- Downloads book covers from OpenLibrary API
- Validates images and extracts dimensions
- Generates `/library/graph.json` for 3D visualization
- Books are connected to DDC (Dewey Decimal Classification) subject nodes

## Project Structure

```
/
├── content/              # Git submodule with blog posts and notes
├── library/              # 3D library visualization
│   ├── img/             # Book cover images (ISBN-based naming)
│   ├── graph.json       # Generated graph data
│   └── index.html       # Library viewer
├── utils/               # Build scripts and tools
│   ├── librarything-to-graph.js
│   └── librarything_caseygollan.json
├── index.html           # Interactive telescopic text bio
├── index-accessible.html # Static accessible version
└── CLAUDE.md           # AI assistant instructions
```

## Deployment

Static site hosted on GitHub Pages with custom domain configuration (via CNAME file). The site is built using 11ty and deployed automatically via GitHub Actions.

## Accessibility

The site provides multiple ways to access content:
- Interactive telescopic text with keyboard navigation
- Static HTML alternative for screen readers and text-only browsers
- Semantic HTML structure throughout

## License

Personal website - all rights reserved for original content.

## Credits

- [Telescopic Text](https://www.telescopictext.org/) for the interactive bio technique
- [3D Force Graph](https://github.com/vasturiano/3d-force-graph) for library visualization
- [11ty](https://www.11ty.dev/) for static site generation
