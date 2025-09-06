class DateArchives {
  data() {
    return {
      pagination: {
        data: "dateArchives",
        size: 1,
        alias: "archive"
      },
      permalink: (data) => `${data.archive.permalink}index.html`,
      eleventyComputed: {
        archiveTitle: (data) => data.archive.title
      }
    };
  }

  getDateArchives(data) {
    const archives = [];
    const seen = new Set();

    // Process notes and bookmarks
    ['notes', 'bookmarks'].forEach(type => {
      const items = data.collections[type] || [];
      
      items.forEach(item => {
        if (!item.data.date) return;
        
        const date = new Date(item.data.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        // Year archive
        const yearKey = `${type}-${year}`;
        if (!seen.has(yearKey)) {
          seen.add(yearKey);
          archives.push({
            permalink: `/${type}/${year}/`,
            title: `${type.charAt(0).toUpperCase() + type.slice(1)} from ${year}`,
            type: type,
            year: year,
            filter: (i) => {
              const d = new Date(i.data.date);
              return d.getFullYear() === year;
            }
          });
        }
        
        // Month archive
        const monthKey = `${type}-${year}-${month}`;
        if (!seen.has(monthKey)) {
          seen.add(monthKey);
          const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          archives.push({
            permalink: `/${type}/${year}/${month}/`,
            title: `${type.charAt(0).toUpperCase() + type.slice(1)} from ${monthName}`,
            type: type,
            year: year,
            month: month,
            filter: (i) => {
              const d = new Date(i.data.date);
              return d.getFullYear() === year && String(d.getMonth() + 1).padStart(2, '0') === month;
            }
          });
        }
        
        // Day archive
        const dayKey = `${type}-${year}-${month}-${day}`;
        if (!seen.has(dayKey)) {
          seen.add(dayKey);
          const dayName = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          archives.push({
            permalink: `/${type}/${year}/${month}/${day}/`,
            title: `${type.charAt(0).toUpperCase() + type.slice(1)} from ${dayName}`,
            type: type,
            year: year,
            month: month,
            day: day,
            filter: (i) => {
              const d = new Date(i.data.date);
              return d.getFullYear() === year && 
                     String(d.getMonth() + 1).padStart(2, '0') === month &&
                     String(d.getDate()).padStart(2, '0') === day;
            }
          });
        }
      });
    });
    
    return archives;
  }

  beforeAll(data) {
    // Calculate date archives once
    data.dateArchives = this.getDateArchives(data);
  }

  render(data) {
    const items = data.collections[data.archive.type].filter(data.archive.filter);
    
    return `
      <h1>${data.archive.title}</h1>
      
      <div class="${data.archive.type}-list">
        ${items.map(item => `
          <article>
            <time datetime="${this.toISOString(item.data.date)}">
              <a href="${item.url}">${this.formatDate(item.data.date)}</a>
            </time>
            ${item.templateContent}
            ${item.data.syndication ? `
              <p class="syndication">
                Also posted on: 
                ${item.data.syndication.map((link, i) => `
                  <a href="${link}">
                    ${link.includes('social.coop') ? 'Mastodon' : 
                      link.includes('bsky.app') ? 'Bluesky' : 
                      link.replace('https://', '')}
                  </a>${i < item.data.syndication.length - 1 ? ', ' : ''}
                `).join('')}
              </p>
            ` : ''}
          </article>
        `).join('')}
      </div>
      
      <p><a href="/${data.archive.type}/">← All ${data.archive.type}</a></p>
    `;
  }

  toISOString(date) {
    return new Date(date).toISOString().split('T')[0];
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

module.exports = DateArchives;