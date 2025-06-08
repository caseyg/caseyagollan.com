# caseyagollan.com

My personal site with an interactive bio and a 3D library thing.

## Adding new books

When I get new books and add them to LibraryThing:

1. Export from https://www.librarything.com/export (JSON format)
2. Download and drop `librarything_caseygollan.json` into `/utils`
3. Run `npm install` if needed
4. Run `npm run update-library` 
5. Run ImageOptim on `/library/img` to compress the new cover images
