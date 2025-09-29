const sass = require("sass");
const path = require("path");

module.exports = class {
  data() {
    return {
      permalink: "/assets/posts.css",
      eleventyExcludeFromCollections: true
    };
  }

  render() {
    const result = sass.compile(
      path.join(__dirname, "scss", "posts.scss"),
      {
        style: "compressed",
        sourceMap: false
      }
    );
    return result.css;
  }
};