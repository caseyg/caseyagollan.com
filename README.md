# caseyagollan.com

My personal site with an interactive bio and a 3D library thing.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Update content submodule to latest
npm run update-content
```

## Updating Content Submodule

The `content` directory is a git submodule pointing to the [caseyagollan-content](https://github.com/caseyg/caseyagollan-content) repository. To update it:

```bash
# Quick update (pulls latest content)
npm run update-content

# Manual update
git submodule update --remote --merge

# If you need to initialize the submodule first time
git submodule update --init --recursive
```

## Adding new books

When I get new books and add them to LibraryThing:

1. Export from https://www.librarything.com/export (JSON format)
2. Download and drop `librarything_caseygollan.json` into `/utils`
3. Run `npm install` if needed
4. Run `npm run update-library` 
5. Run ImageOptim on `/library/img` to compress the new cover images
