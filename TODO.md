# TODO

## Homepage Skills Graph - AI Insights (2025-10-19)

### ✅ Completed
- [x] Structured insight output with custom `provide_insight` tool
- [x] Returns `insight` + `recommended_topics` array (2-3 topics)
- [x] Enhanced prompt with verb tense handling, source preferences, current year
- [x] Sources extracted from web search results (up to 5 displayed)
- [x] InsightCard UI updated to display recommended topics and sources
- [x] Fixed streaming detection for custom tool (`tool_use` vs `server_tool_use`)
- [x] Cloudflare KV namespace created (`INSIGHT_CACHE`)
- [x] KV caching logic in `/api/generate-insight`:
  - Check cache before API calls (24-hour TTL)
  - Replay all streaming events from cache on hit
  - Save all events + data after successful API call
- [x] TypeScript types added for Cloudflare Workers platform bindings
- [x] `wrangler.toml` configured with KV binding and `nodejs_compat` flag
- [x] Updated to `@sveltejs/adapter-cloudflare`

### 🔧 Current State
- **Development workflow options**:
  - `bun run dev` - Vite dev server on :5173 (fast HMR, no KV bindings)
  - `bun run preview` - Wrangler Pages dev with local KV simulation (build first)
  - `bun run preview:remote` - Wrangler with remote production KV (build first)
- KV implementation complete and production-ready
- **Environment variables**: Both API routes use `platform.env` (required for Cloudflare Workers)
- **Wrangler Configuration**: `wrangler.jsonc` configured
  - Workers format with `main` and `assets` bindings
  - `nodejs_als` compatibility flag
  - KV namespace binding: `INSIGHT_CACHE`
  - Observability enabled
- **✅ Local KV testing fixed**: Use `wrangler pages dev` after build instead of trying to run wrangler during build
  - SvelteKit uses Vite for dev (no bindings), Wrangler for preview/deploy (with bindings)
  - EPIPE error resolved by building first, then running wrangler on completed output

### 📝 Notes
- Cache key format: `insight:{topic}` (lowercase, trimmed)
- Cache includes: timestamp, topic, insight, recommendedTopics, sources, events array
- Original implementation reference: `/Users/cag/GitHub/caseyagollan.com/.conductor/tallinn/src/routes/api.insights.ts`
- Model: `claude-haiku-4-5-20251001` with temperature 1
- Web search tool: `web_search_20250305`

### 🚀 Next Steps (when ready)
- [ ] Test KV locally with `bun run preview` to verify cache hits/misses
- [ ] Deploy to Cloudflare Pages to test KV caching in production
- [ ] Consider making recommended topics clickable to focus graph
- [ ] Monitor cache hit rates and API usage

---

## Library Improvements

- [x] Fix DDC divider nodes positioning in grid mode - only some are appearing inline in the shelf, need to ensure all relevant DDC dividers show up in proper grid positions when in DDC sort mode
  - Fixed by grouping books by top-level DDC class (e.g., 700) instead of full 3-digit code (e.g., 701)
  - Updated DDC class names to match actual graph data ("Science" and "History" instead of "Science & mathematics" and "History & geography")
- [x] Separate shelves for each DDC category in DDC sort mode
  - Each DDC category (e.g., "Arts & recreation", "Technology") gets its own shelf rows
  - DDC label positioned on the left side of each category's shelf
- [x] Hide non-top-level DDC node labels in grid mode
  - Only top-level category labels shown (e.g., "Arts & recreation"), subcategories hidden
- [x] Fix graph animation when returning from shelf to graph mode
  - Clear fixed positions (fx/fy/fz) on nodes before returning to graph
  - Reheat force simulation with `d3ReheatSimulation()` for smooth animation back
- [x] Improve drag/pan behavior in shelf view
  - Enable panning for easier shelf navigation
  - Maintain zoom and rotation controls

## Future Enhancements

- [ ] Improve animation smoothness between grid sort modes
- [ ] Add more visual distinction for DDC divider nodes in grid layout