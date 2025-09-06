const _ = require('lodash');

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
  
  // Combined collection for all posts
  eleventyConfig.addCollection("posts", function(collectionApi) {
    return collectionApi.getFilteredByGlob("./content/**/*.md")
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
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
        
        return `/${year}/${month}/${day}/${slug}/`;
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

  // Create collections grouped by year
  eleventyConfig.addCollection('notesByYear', collection => {
    const allNotes = collection.getFilteredByGlob('./content/notes/*.md');
    const byYear = {};
    
    allNotes.forEach(note => {
      const date = new Date(note.data.date);
      const year = date.getFullYear();
      
      if(!byYear[year]) {
        byYear[year] = [];
      }
      
      byYear[year].push(note);
    });
    
    return byYear;
  });
  
  eleventyConfig.addCollection('bookmarksByYear', collection => {
    const allBookmarks = collection.getFilteredByGlob('./content/bookmarks/*.md');
    const byYear = {};
    
    allBookmarks.forEach(bookmark => {
      const date = new Date(bookmark.data.date);
      const year = date.getFullYear();
      
      if(!byYear[year]) {
        byYear[year] = [];
      }
      
      byYear[year].push(bookmark);
    });
    
    return byYear;
  });
  
  // Add collections grouped by month
  eleventyConfig.addCollection('notesByMonth', collection => {
    const allNotes = collection.getFilteredByGlob('./content/notes/*.md');
    const grouped = {};
    
    allNotes.forEach(note => {
      const date = new Date(note.data.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      
      if(!grouped[year]) { grouped[year] = {}; }
      if(!grouped[year][month]) { grouped[year][month] = []; }
      
      grouped[year][month].push(note);
    });
    
    return grouped;
  });
  
  eleventyConfig.addCollection('bookmarksByMonth', collection => {
    const allBookmarks = collection.getFilteredByGlob('./content/bookmarks/*.md');
    const grouped = {};
    
    allBookmarks.forEach(bookmark => {
      const date = new Date(bookmark.data.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      
      if(!grouped[year]) { grouped[year] = {}; }
      if(!grouped[year][month]) { grouped[year][month] = []; }
      
      grouped[year][month].push(bookmark);
    });
    
    return grouped;
  });
  
  // Add filter to convert month number to name
  eleventyConfig.addFilter('toMonth', month => {
    return ['January', 'February', 'March', 'April',
            'May', 'June', 'July', 'August',
            'September', 'October', 'November', 'December'][month];
  });

  // Year collection
  eleventyConfig.addCollection('postsByYear', (collection) => {
    return _.chain(collection.getFilteredByGlob("./content/**/*.md"))
      .groupBy((post) => post.date.getFullYear())
      .toPairs()
      .reverse()
      .value();
  });

  // Year / Month collection
  eleventyConfig.addCollection('postsByYearMonth', (collection) => {
    return _.chain(collection.getFilteredByGlob("./content/**/*.md"))
      .groupBy((post) => {
        const year = post.date.getFullYear();
        const month = String(post.date.getMonth() + 1).padStart(2, '0');
        return `${year}/${month}`;
      })
      .toPairs()
      .reverse()
      .value();
  });

  // Year / Month / Day collection
  eleventyConfig.addCollection('postsByYearMonthDay', (collection) => {
    return _.chain(collection.getFilteredByGlob("./content/**/*.md"))
      .groupBy((post) => {
        const year = post.date.getFullYear();
        const month = String(post.date.getMonth() + 1).padStart(2, '0');
        const day = String(post.date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
      })
      .toPairs()
      .reverse()
      .value();
  });

  // Helper filter to format month names
  eleventyConfig.addFilter('monthName', (monthNum) => {
    const date = new Date(2000, parseInt(monthNum) - 1, 1);
    return date.toLocaleString('en-US', { month: 'long' });
  });

  // Helper filters for parsing date parts
  eleventyConfig.addFilter('getYear', (dateStr) => dateStr.split('/')[0]);
  eleventyConfig.addFilter('getMonth', (dateStr) => dateStr.split('/')[1]);
  eleventyConfig.addFilter('getDay', (dateStr) => dateStr.split('/')[2]);
  
  // Add weekday filter
  eleventyConfig.addFilter('weekday', (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  });

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
