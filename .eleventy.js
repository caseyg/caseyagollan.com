module.exports = function (eleventyConfig) {
  // Filters
  eleventyConfig.addNunjucksFilter("json", (value) => JSON.stringify(value));
  
  // Date formatting filter
  eleventyConfig.addNunjucksFilter("date", (date, format) => {
    const d = new Date(date);
    if (format === "iso") {
      return d.toISOString().split('T')[0];
    }
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  });
  
  // Collections from content submodule
  eleventyConfig.addCollection("notes", function(collectionApi) {
    return collectionApi.getFilteredByGlob("./content/notes/*.md").reverse();
  });
  
  eleventyConfig.addCollection("bookmarks", function(collectionApi) {
    return collectionApi.getFilteredByGlob("./content/bookmarks/*.md").reverse();
  });

  // Add computed data for permalink generation and layout
  eleventyConfig.addGlobalData("eleventyComputed", {
    permalink: function(data) {
      // Only apply to notes and bookmarks from content directory
      if (data.page.inputPath.includes("/content/notes/") || data.page.inputPath.includes("/content/bookmarks/")) {
        const date = new Date(data.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const filename = data.page.fileSlug;
        
        // Extract the slug from filename (e.g., "2025-09-01-207e2" -> "207e2")
        const slug = filename.split('-').slice(3).join('-') || filename;
        
        const type = data.page.inputPath.includes("/notes/") ? "notes" : "bookmarks";
        return `/${type}/${year}/${month}/${day}/${slug}/`;
      }
      return data.permalink;
    },
    layout: function(data) {
      // Apply post layout to content files that don't have a layout specified
      if (!data.layout && (data.page.inputPath.includes("/content/notes/") || data.page.inputPath.includes("/content/bookmarks/"))) {
        return "post";
      }
      return data.layout;
    }
  });
  
  // Passthrough copies
  eleventyConfig.addPassthroughCopy("sisu.gif");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy("library/img");
  eleventyConfig.addPassthroughCopy("library/graph.json");
  eleventyConfig.addPassthroughCopy("library/thumbnail.png");

  // Watch useful folders
  eleventyConfig.addWatchTarget("library");
  eleventyConfig.addWatchTarget("ai");
  eleventyConfig.addWatchTarget("utils");
  // Watch content submodule
  eleventyConfig.addWatchTarget("content");

  return {
    dir: {
      input: ".",
      output: "_site",
      // Add external content directory to includes
      includes: "_includes",
      data: "_data"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["html", "njk", "md"],
  };
};
