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
