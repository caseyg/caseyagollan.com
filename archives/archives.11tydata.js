module.exports = {
  layout: "base",
  eleventyComputed: {
    title: (data) => data.archiveTitle || "Archive"
  }
};