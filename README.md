# caseyagollan.com


## Updating Library page

After adding new books to LibraryThing:

1. Go to https://www.librarything.com/export
2. Select JSON format
3. Click "Export All Books" button and then "Download"
4. Move `librarything_caseygollan.json` file into `/utils`
5. Install dependencies with `npm install`
6. Run `node utils/updateLibrary.js`
7. Run ImageOptim on `/library/img`