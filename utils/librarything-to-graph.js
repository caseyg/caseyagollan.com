const fs = require('fs');
const imageSize = require('image-size');
const sharp = require('sharp');

// Function to extract average color from image
async function getImageAverageColor(imagePath) {
  try {
    const { data, info } = await sharp(imagePath)
      .resize(50, 50) // Resize to small image for faster processing
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    let r = 0, g = 0, b = 0;
    const pixelCount = info.width * info.height;
    
    for (let i = 0; i < data.length; i += 3) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    
    r = Math.floor(r / pixelCount);
    g = Math.floor(g / pixelCount);
    b = Math.floor(b / pixelCount);
    
    return `rgb(${r}, ${g}, ${b})`;
  } catch (error) {
    console.warn(`Could not extract color from ${imagePath}:`, error.message);
    return '#666666'; // Default gray
  }
}

// Read JSON file from command line argument
const filename = './utils/librarything_caseygollan.json';
fs.readFile(filename, 'utf8', async (err, data) => {
  if (err) {
    console.error(`Error reading file from disk: ${err}`);
    return;
  }
  try {
    const jsonData = JSON.parse(data);
    const nodes = [];
    const links = [];
    const ddcWordingSet = new Set();

    // Ensure the 'img' directory exists
    const imgDir = './static/library/img';
    if (!fs.existsSync(imgDir)){
      fs.mkdirSync(imgDir, { recursive: true });
    }

    // Collect all unique DDC wordings and create nodes for each book
    const promises = Object.values(jsonData).map(async (book) => {
      if (book.ddc && book.ddc.wording) {
          
          // Check for the existence of the image file
          const imgPath = `${imgDir}/${book.originalisbn}.jpg`;
          if (!fs.existsSync(imgPath)) {
              // Download the image if it does not exist
              const imageUrl = `https://covers.openlibrary.org/b/isbn/${book.originalisbn}-M.jpg`;
              require('https').get(imageUrl, function(response) {
                  if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                      // If redirected, recursively call the same function with the new location
                      require('https').get(response.headers.location, arguments.callee);
                  } else {
                      const chunks = [];
                      response.on('data', chunk => chunks.push(chunk));
                      response.on('end', () => {
                          const buffer = Buffer.concat(chunks);
                          fs.writeFileSync(imgPath, buffer);
                          // Check if the file size is 0 or dimensions are 1x1
                          if (fs.statSync(imgPath).size === 0) {
                              console.log(`File is empty for ISBN: ${book.originalisbn}`);
                                                           fs.unlinkSync(imgPath); // Remove the empty file
                          } else {
                              const dimensions = imageSize(imgPath);
                              if (dimensions.width === 1 && dimensions.height === 1) {
                                                                   console.log(`Image dimensions are 1x1 for ISBN: ${book.originalisbn}`);
                                  fs.unlinkSync(imgPath); // Remove the 1x1 dimension file
                              }
                          }
                      });
                  }
              });
        };
        const node = {
            id: book.title,
            workcode: book.workcode,
            bookid: parseInt(book.books_id),
            isbn: book.originalisbn,
            pages: parseInt(book.pages),
            group: "book",
            // Additional metadata used for sorting in grid mode
            dateacquired: book.dateacquired,
            publicationYear: parseInt(book.date),
            ddcCode: Array.isArray(book.ddc.code) ? book.ddc.code[0] : book.ddc.code
        };
        if (fs.existsSync(imgPath)) {
            const imgDimensions = imageSize(imgPath);
            node.img = `img/${book.originalisbn}.jpg`;
            node.w = imgDimensions.width;
            node.h = imgDimensions.height;
            // Extract average color from the image
            node.averageColor = await getImageAverageColor(imgPath);
            console.log(`Extracted color ${node.averageColor} for ${book.title}`);
        }
        nodes.push(node);
        // Add DDC wordings to the set and create edges from book to all DDC wordings
        book.ddc.wording.forEach(wording => {
          links.push({
            source: book.title,
            target: wording,
            value: 1
          });
        });
        book.ddc.wording.forEach(word => ddcWordingSet.add(word));
      }
    });

    // Wait for all image processing to complete
    await Promise.all(promises);

    // Create nodes from unique DDC wordings
    ddcWordingSet.forEach(word => {
      nodes.push({ id: word, group: "ddc" });
    });

    // Create edges connecting each word to its neighbor within the same DDC array
    Object.values(jsonData).forEach(book => {
      if (book.ddc && book.ddc.wording) {
        book.ddc.wording.forEach((word, index, wordingArray) => {
          if (index < wordingArray.length - 1) {
            links.push({
              source: wordingArray[index],
              target: wordingArray[index + 1],
              value: 1
            });
          }
        });
      }
    });

    const bookNodes = new Set(nodes.filter(node => node.group === 'book').map(node => node.id));
    const filteredLinks = links.filter(link => bookNodes.has(link.source));

    // Create a map to count connections to each DDC node
    const ddcNodeConnections = new Map();
    filteredLinks.forEach(link => {
      if (nodes.find(node => node.id === link.target && node.group === 'ddc')) {
        ddcNodeConnections.set(link.target, (ddcNodeConnections.get(link.target) || 0) + 1);
      }
    });

    // Add connection count as a point to each DDC node
    const updatedNodes = nodes.map(node => {
      if (node.group === 'ddc' && ddcNodeConnections.has(node.id)) {
        return { ...node, points: ddcNodeConnections.get(node.id) };
      }
      return node;
    });

    // Filter nodes to include only those that are connected
    const filteredNodes = updatedNodes.filter(node => node.group !== 'ddc' || ddcNodeConnections.has(node.id));
    const processedData = { nodes: filteredNodes, links: filteredLinks };

    // Write the processed data to graph.json
    fs.writeFile('./static/library/graph.json', JSON.stringify(processedData, null, 2), err => {
      if (err) {
        console.error(`Error writing file: ${err}`);
      } else {
        console.log('Successfully wrote graph data to static/library/graph.json');
      }
    });
  } catch (parseErr) {
    console.error(`Error parsing JSON data: ${parseErr}`);
  }
});
