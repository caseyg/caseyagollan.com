# Screenshot Tooltip Feature Plan

## Overview
Add screenshot previews to citation node tooltips in the skills graph. When hovering over a favicon, show a browser-window-styled tooltip with a live screenshot of the page.

## Architecture

### 1. API Endpoint: `/api/screenshot/+server.ts`
Creates a new endpoint that:
- Takes a `url` query parameter
- Generates a cache key from URL hash
- Checks R2 bucket for cached screenshot
- If not cached, calls Cloudflare Browser Rendering REST API
- Stores result in R2 with 7-day expiration
- Returns screenshot as PNG image

### 2. R2 Bucket Configuration
- Use existing `caseyagollan-content` bucket (already exists)
- Store screenshots at path: `screenshots/{url-hash}.png`
- Add R2 binding to `wrangler.jsonc`

### 3. Environment Variables
Add to Cloudflare Pages environment:
- `CLOUDFLARE_ACCOUNT_ID` - for Browser Rendering API
- `CLOUDFLARE_API_TOKEN` - with "Browser Rendering - Edit" permission

### 4. Component Changes: `SkillsGraph.svelte`
Modify the citation tooltip behavior:
- Track screenshot URLs in component state: `Map<string, string | 'loading' | 'error'>`
- On hover, show immediate tooltip with:
  - Browser window chrome (title bar, URL bar)
  - Loading skeleton while screenshot loads
  - Screenshot image when ready
- Fetch screenshot from `/api/screenshot?url=...`
- Cache fetched screenshot data URLs in component state

### 5. Tooltip Design
```
+--[Title]------------------[x]+
| [favicon] example.com/path   |
+------------------------------+
|                              |
|   [Screenshot or skeleton]   |
|          280x200             |
|                              |
+------------------------------+
| "Cited text excerpt..."      |
+------------------------------+
```

## Implementation Steps

### Step 1: Add R2 binding to wrangler.jsonc
```jsonc
"r2_buckets": [
  {
    "binding": "SCREENSHOTS",
    "bucket_name": "caseyagollan-content"
  }
]
```

### Step 2: Create screenshot API endpoint
File: `src/routes/api/screenshot/+server.ts`
- Hash URL for cache key
- Check R2 for existing screenshot
- If cache miss, call Browser Rendering API:
  ```typescript
  POST https://api.cloudflare.com/client/v4/accounts/{accountId}/browser-rendering/screenshot
  {
    "url": "...",
    "viewport": { "width": 1280, "height": 800 },
    "screenshotOptions": { "type": "png" },
    "gotoOptions": { "waitUntil": "networkidle0", "timeout": 10000 }
  }
  ```
- Store in R2: `screenshots/{hash}.png`
- Return image with caching headers

### Step 3: Update SkillsGraph tooltip
- Add state: `screenshotCache: Map<string, string>`
- Modify `mouseenter` handler to:
  1. Show tooltip immediately with loading state
  2. Fetch `/api/screenshot?url=...` asynchronously
  3. Update tooltip with screenshot when loaded
- Add browser-window CSS styling
- Add skeleton loading animation

### Step 4: Add tooltip CSS
New styles for:
- `.tooltip-browser` - browser window container
- `.tooltip-titlebar` - macOS-style traffic lights
- `.tooltip-urlbar` - URL display
- `.tooltip-screenshot` - screenshot container
- `.tooltip-skeleton` - loading animation

## API Response Format

### Success (cached or fresh):
- Status: 200
- Content-Type: image/png
- Headers:
  - `X-Cache-Status: HIT` or `MISS`
  - `Cache-Control: public, max-age=604800`

### Error:
- Status: 500
- JSON: `{ "error": "..." }`

## Cost Considerations
- Browser Rendering: $0.10 per 1,000 screenshots
- R2: Free for first 10GB storage, $0.015/GB/month after
- Screenshots cached for 7 days reduces API calls

## Fallback Behavior
- If screenshot fails, show existing tooltip (title + excerpt)
- If screenshot takes >3s, show timeout message
- If URL is blocked by target site, show error state
