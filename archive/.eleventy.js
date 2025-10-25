// Load environment variables from .env file
require('dotenv').config();

const _ = require("lodash");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const pluginWebc = require("@11ty/eleventy-plugin-webc");
const pluginWebmentions = require("@chrisburnell/eleventy-cache-webmentions");
const sanitizeHTML = require("sanitize-html");
const markdownIt = require("markdown-it");
const pluginEmbedEverything = require("eleventy-plugin-embed-everything");

module.exports = async function (eleventyConfig) {
  const { RenderPlugin } = await import("@11ty/eleventy");

  // Plugins
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(RenderPlugin);
  eleventyConfig.addPlugin(pluginWebc, {
    components: [
      "./_components/**/*.webc",
    ]
  });
  eleventyConfig.addPlugin(pluginEmbedEverything);

  // Webmentions plugin
  eleventyConfig.addPlugin(pluginWebmentions, {
    domain: "caseyagollan.com",
    feed: `https://webmention.io/api/mentions.jf2?domain=caseyagollan.com&token=${process.env.WEBMENTION_IO_TOKEN || ''}&per-page=10000`,
    key: "children",
    directory: ".cache",
    duration: "1d",
    uniqueKey: "wm-id",
    allowedHTML: {
      allowedTags: ["b", "i", "em", "strong", "a"],
      allowedAttributes: {
        a: ["href"]
      }
    }
  });
  // Filters
  eleventyConfig.addNunjucksFilter("json", (value) => JSON.stringify(value));

  // Markdown configuration for automatic link detection and embeds
  const markdownLibrary = markdownIt({
    html: true,
    breaks: true,
    linkify: true,
  });
  eleventyConfig.setLibrary("md", markdownLibrary);

  // Custom truncate filter to use ellipsis character
  eleventyConfig.addNunjucksFilter("truncate", (str, length = 200) => {
    if (!str || str.length <= length) return str;
    return str.substring(0, length).trim() + "…";
  });

  // Decode HTML entities filter
  eleventyConfig.addNunjucksFilter("decodeEntities", (str) => {
    if (!str) return str;
    const entities = {
      "&quot;": '"',
      "&#34;": '"',
      "&apos;": "'",
      "&#39;": "'",
      "&amp;": "&",
      "&#38;": "&",
      "&lt;": "<",
      "&#60;": "<",
      "&gt;": ">",
      "&#62;": ">",
      "&nbsp;": " ",
      "&#160;": " ",
    };
    return str.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  });

  // Webmentions Filter
  eleventyConfig.addNunjucksFilter(
    "getWebmentionsForUrl",
    function (webmentions, url) {
      if (!webmentions || !Array.isArray(webmentions)) return [];

      const allowedTypes = ["mention-of", "in-reply-to"];
      const allowedHTML = {
        allowedTags: ["b", "i", "em", "strong", "a"],
        allowedAttributes: {
          a: ["href"],
        },
      };

      const hasRequiredFields = (entry) => {
        const { author, published, content } = entry;
        // For mentions, we're more lenient - just need something
        if (entry["wm-property"] === "mention-of") {
          // Even if author fields are empty strings, we'll show the mention
          return true;
        }
        // For replies, we need more info
        return (
          author &&
          author.name &&
          published &&
          content &&
          (content.html || content.text || content.value)
        );
      };

      const sanitize = (entry) => {
        const { content } = entry;
        if (content) {
          if (content.html) {
            content.html = sanitizeHTML(content.html, allowedHTML);
          } else if (content.value && content["content-type"] === "text/html") {
            content.value = sanitizeHTML(content.value, allowedHTML);
          }
        }
        return entry;
      };

      return webmentions
        .filter((entry) => entry["wm-target"] === url)
        .filter((entry) => allowedTypes.includes(entry["wm-property"]))
        .filter(hasRequiredFields)
        .map(sanitize);
    },
  );

  // Filter for likes
  eleventyConfig.addNunjucksFilter(
    "getWebmentionLikes",
    function (webmentions, url) {
      if (!webmentions || !Array.isArray(webmentions)) return [];
      return webmentions
        .filter((entry) => entry["wm-target"] === url)
        .filter((entry) => entry["wm-property"] === "like-of");
    },
  );

  // Filter for reposts
  eleventyConfig.addNunjucksFilter(
    "getWebmentionReposts",
    function (webmentions, url) {
      if (!webmentions || !Array.isArray(webmentions)) return [];
      return webmentions
        .filter((entry) => entry["wm-target"] === url)
        .filter((entry) => entry["wm-property"] === "repost-of");
    },
  );

  // Filter to count webmentions by type
  eleventyConfig.addNunjucksFilter(
    "countWebmentions",
    function (webmentions, url) {
      if (!webmentions || !Array.isArray(webmentions)) {
        return { total: 0, likes: 0, reposts: 0, replies: 0, mentions: 0 };
      }

      const filtered = webmentions.filter(
        (entry) => entry["wm-target"] === url,
      );
      const counts = {
        total: filtered.length,
        likes: 0,
        reposts: 0,
        replies: 0,
        mentions: 0,
      };

      filtered.forEach((entry) => {
        switch (entry["wm-property"]) {
          case "like-of":
            counts.likes++;
            break;
          case "repost-of":
            counts.reposts++;
            break;
          case "in-reply-to":
            counts.replies++;
            break;
          case "mention-of":
            counts.mentions++;
            break;
        }
      });

      return counts;
    },
  );

  // Date formatting filter
  eleventyConfig.addNunjucksFilter("date", (date, format) => {
    const d = new Date(date);
    if (format === "iso") {
      return d.toISOString().split("T")[0];
    }
    if (format === "MM") {
      return String(d.getMonth() + 1).padStart(2, "0");
    }
    if (format === "MMMM") {
      return d.toLocaleDateString("en-US", { month: "long" });
    }
    if (format === "time") {
      return d
        .toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/New_York",
        })
        .toLowerCase();
    }
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    });
  });

  // Collections from content submodule
  eleventyConfig.addCollection("notes", function (collectionApi) {
    return collectionApi.getFilteredByGlob("./content/notes/*.md").reverse();
  });

  eleventyConfig.addCollection("bookmarks", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("./content/bookmarks/*.md")
      .reverse();
  });

  // Combined collection for all posts
  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("./content/**/*.md")
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
  });

  // Create collections for each tag/category
  eleventyConfig.addCollection("tagList", function (collectionApi) {
    const tagSet = new Set();
    collectionApi.getAll().forEach((item) => {
      if (item.data.category) {
        if (typeof item.data.category === "string") {
          tagSet.add(item.data.category.toLowerCase());
        } else if (Array.isArray(item.data.category)) {
          item.data.category.forEach((cat) => tagSet.add(cat.toLowerCase()));
        }
      }
    });
    return [...tagSet].sort();
  });

  // Create collections for each tag dynamically
  // We need to get the tag list first, then create collections for each
  eleventyConfig.addCollection("changelog", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("./content/**/*.md")
      .filter((post) => {
        if (typeof post.data.category === "string") {
          return post.data.category.toLowerCase() === "changelog";
        }
        if (Array.isArray(post.data.category)) {
          return post.data.category.some(cat => cat.toLowerCase() === "changelog");
        }
        return false;
      })
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
  });

  eleventyConfig.addCollection("ai", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("./content/**/*.md")
      .filter((post) => {
        if (typeof post.data.category === "string") {
          return post.data.category.toLowerCase() === "ai";
        }
        if (Array.isArray(post.data.category)) {
          return post.data.category.some(cat => cat.toLowerCase() === "ai");
        }
        return false;
      })
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
  });

  eleventyConfig.addCollection("indieweb", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("./content/**/*.md")
      .filter((post) => {
        if (typeof post.data.category === "string") {
          return post.data.category.toLowerCase() === "indieweb";
        }
        if (Array.isArray(post.data.category)) {
          return post.data.category.some(cat => cat.toLowerCase() === "indieweb");
        }
        return false;
      })
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
  });

  // Add metadata for RSS feed
  eleventyConfig.addGlobalData("metadata", {
    title: "Casey Gollan",
    url: "https://caseyagollan.com",
    language: "en",
    description: "Posts from caseyagollan.com",
    author: {
      name: "Casey Gollan",
    },
  });

  // Add computed data for permalink generation and layout
  eleventyConfig.addGlobalData("eleventyComputed", {
    permalink: function (data) {
      // Apply to all post types from content directory (indiekit collections)
      if (data.page.inputPath.includes("/content/")) {
        const date = new Date(data.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const filename = data.page.fileSlug;

        // Extract the slug from filename
        // For date-prefixed files (e.g., "2025-09-01-slug-here" -> "slug-here")
        // Check if filename starts with YYYY-MM-DD pattern
        const datePattern = /^\d{4}-\d{2}-\d{2}-(.+)$/;
        const match = filename.match(datePattern);
        const slug = match ? match[1] : filename;

        return `/${year}/${month}/${day}/${slug}/`;
      }
      return data.permalink;
    },
    layout: function (data) {
      // Apply post layout to all content files that don't have a layout specified
      if (!data.layout && data.page.inputPath.includes("/content/")) {
        return "post";
      }
      return data.layout;
    },
  });

  // Passthrough copies
  eleventyConfig.addPassthroughCopy("sisu.gif");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addPassthroughCopy("library/img");
  eleventyConfig.addPassthroughCopy("library/graph.json");
  eleventyConfig.addPassthroughCopy("library/thumbnail.png");
  // Copy media files from content submodule to root media folder
  eleventyConfig.addPassthroughCopy({ "content/media": "media" });

  // Watch useful folders
  eleventyConfig.addWatchTarget("library");
  eleventyConfig.addWatchTarget("ai");
  eleventyConfig.addWatchTarget("utils");
  eleventyConfig.addWatchTarget("_assets/scss");
  eleventyConfig.addWatchTarget("_components/**/*.webc");
  // Watch content submodule
  eleventyConfig.addWatchTarget("content");

  // Create collections grouped by year
  eleventyConfig.addCollection("notesByYear", (collection) => {
    const allNotes = collection.getFilteredByGlob("./content/notes/*.md");
    const byYear = {};

    allNotes.forEach((note) => {
      const date = new Date(note.data.date);
      const year = date.getFullYear();

      if (!byYear[year]) {
        byYear[year] = [];
      }

      byYear[year].push(note);
    });

    return byYear;
  });

  eleventyConfig.addCollection("bookmarksByYear", (collection) => {
    const allBookmarks = collection.getFilteredByGlob(
      "./content/bookmarks/*.md",
    );
    const byYear = {};

    allBookmarks.forEach((bookmark) => {
      const date = new Date(bookmark.data.date);
      const year = date.getFullYear();

      if (!byYear[year]) {
        byYear[year] = [];
      }

      byYear[year].push(bookmark);
    });

    return byYear;
  });

  // Add collections grouped by month
  eleventyConfig.addCollection("notesByMonth", (collection) => {
    const allNotes = collection.getFilteredByGlob("./content/notes/*.md");
    const grouped = {};

    allNotes.forEach((note) => {
      const date = new Date(note.data.date);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (!grouped[year]) {
        grouped[year] = {};
      }
      if (!grouped[year][month]) {
        grouped[year][month] = [];
      }

      grouped[year][month].push(note);
    });

    return grouped;
  });

  eleventyConfig.addCollection("bookmarksByMonth", (collection) => {
    const allBookmarks = collection.getFilteredByGlob(
      "./content/bookmarks/*.md",
    );
    const grouped = {};

    allBookmarks.forEach((bookmark) => {
      const date = new Date(bookmark.data.date);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (!grouped[year]) {
        grouped[year] = {};
      }
      if (!grouped[year][month]) {
        grouped[year][month] = [];
      }

      grouped[year][month].push(bookmark);
    });

    return grouped;
  });

  // Combined posts by month collection
  eleventyConfig.addCollection("postsByMonth", (collection) => {
    const allPosts = collection.getFilteredByGlob("./content/**/*.md");
    const grouped = {};

    allPosts.forEach((post) => {
      const date = new Date(post.data.date);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (!grouped[year]) {
        grouped[year] = {};
      }
      if (!grouped[year][month]) {
        grouped[year][month] = [];
      }

      grouped[year][month].push(post);
    });

    return grouped;
  });

  // Combined posts by day collection
  eleventyConfig.addCollection("postsByDay", (collection) => {
    const allPosts = collection.getFilteredByGlob("./content/**/*.md");
    const grouped = {};

    allPosts.forEach((post) => {
      const date = new Date(post.data.date);
      const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }

      grouped[dateKey].push(post);
    });

    return grouped;
  });

  // Add filter to convert month number to name
  eleventyConfig.addFilter("toMonth", (month) => {
    return [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][month];
  });

  // Year collection
  eleventyConfig.addCollection("postsByYear", (collection) => {
    return _.chain(collection.getFilteredByGlob("./content/**/*.md"))
      .groupBy((post) => post.date.getFullYear())
      .toPairs()
      .reverse()
      .value();
  });

  // Year / Month collection
  eleventyConfig.addCollection("postsByYearMonth", (collection) => {
    return _.chain(collection.getFilteredByGlob("./content/**/*.md"))
      .groupBy((post) => {
        const year = post.date.getFullYear();
        const month = String(post.date.getMonth() + 1).padStart(2, "0");
        return `${year}/${month}`;
      })
      .toPairs()
      .reverse()
      .value();
  });

  // Year / Month / Day collection
  eleventyConfig.addCollection("postsByYearMonthDay", (collection) => {
    return _.chain(collection.getFilteredByGlob("./content/**/*.md"))
      .groupBy((post) => {
        const year = post.date.getFullYear();
        const month = String(post.date.getMonth() + 1).padStart(2, "0");
        const day = String(post.date.getDate()).padStart(2, "0");
        return `${year}/${month}/${day}`;
      })
      .toPairs()
      .reverse()
      .value();
  });

  // Helper filter to format month names
  eleventyConfig.addFilter("monthName", (monthNum) => {
    const date = new Date(2000, parseInt(monthNum) - 1, 1);
    return date.toLocaleString("en-US", { month: "long" });
  });

  // Helper filters for parsing date parts
  eleventyConfig.addFilter("getYear", (dateStr) => dateStr.split("/")[0]);
  eleventyConfig.addFilter("getMonth", (dateStr) => dateStr.split("/")[1]);
  eleventyConfig.addFilter("getDay", (dateStr) => dateStr.split("/")[2]);

  // Add weekday filter
  eleventyConfig.addFilter("weekday", (date) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { weekday: "long" });
  });

  return {
    dir: {
      input: ".",
      output: "_site",
      // Add external content directory to includes
      includes: "_includes",
      data: "_data",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["html", "njk", "md", "xml", "11ty.js", "webc"],
  };
};
