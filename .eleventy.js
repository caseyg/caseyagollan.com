module.exports = function (eleventyConfig) {
  // Filters
  eleventyConfig.addNunjucksFilter("json", (value) => JSON.stringify(value));
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

  return {
    dir: {
      input: ".",
      output: "_site",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["html", "njk", "md"],
  };
};
