# Migrate AI Features to inference.coop + Kagi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Replace Anthropic Claude API (with built-in web search and text editor tools) with inference.coop OpenAI-compatible inference + Kagi Fast Search API for the homepage AI features.

**Architecture:** Two SvelteKit API endpoints (`/api/generate-insight` and `/api/update-document`) currently use `@anthropic-ai/sdk`. We'll replace this dep with `openai`, call Kagi's Fast Search API to gather context, then pass results to inference.coop models via the standard OpenAI `/v1/chat/completions` endpoint. The text editor tool is removed in favor of prompt-based document rewriting.

**Tech Stack:** SvelteKit 2, Cloudflare Workers, `openai` SDK, Kagi Fast Search API v0, inference.coop gateway.

**Spec:** This plan (self-contained; no separate spec).

## Global Constraints

- **Base URL:** `https://gateway.inference.coop/v1`
- **Insight model:** `greenpt/deepseek-v4.1-flash`
- **Document edit model:** `greenpt/glm-5.3-flash`
- **Kagi endpoint:** `POST https://kagi.com/api/v0/fastsearch`
- **Kagi auth header:** `Authorization: Bot ${KAGI_API_KEY}`
- **Cloudflare secrets:** `INFERENCE_COOP_API_KEY`, `KAGI_API_KEY`
- **KV cache namespace:** `INSIGHT_CACHE` (unchanged)
- **Remove `@anthropic-ai/sdk`** from dependencies; add `openai`
- Preserve all existing caching, streaming, SSE, KV storage behavior
- Preserve all existing front-end error handling strings (make them generic, not Claude-specific)

## Review Focus

1. **Missing API keys** — When `INFERENCE_COOP_API_KEY` or `KAGI_API_KEY` are absent, the error messages are helpful but the stream doesn't crash the page.
2. **Kagi empty results** — When Kagi returns no results for a topic, the insight generation should still produce a sensible fallback statement.
3. **Document edit truncation** — Without the text editor tool, the model may return markdown or exceed word counts; prompt engineering and post-processing must enforce the 150-word plain-text limit.
4. **Stream interruption** — SSE stream from `update-document` must still send proper `data:` events and `type: "done"` even when the model returns a single chunk (no tool iterations).
5. **Model name escaping** — inference.coop model names contain slashes (`greenpt/deepseek-v4.1-flash`); ensure they pass through JSON and URL encoding correctly.

---

## File Map

- **Modify:** `package.json` — swap `@anthropic-ai/sdk` for `openai`
- **Modify:** `src/app.d.ts` — add `INFERENCE_COOP_API_KEY` and `KAGI_API_KEY` to `Platform.env`
- **Modify:** `src/routes/api/generate-insight/+server.ts` — Kagi search + inference.coop via `openai` SDK
- **Modify:** `src/routes/api/update-document/+server.ts` — inference.coop via `openai` SDK, simple prompt-based rewrite
- **Modify:** `src/routes/+page.svelte` — update error strings to be generic (not "Claude")
- **Modify:** `.env.example` — document new env vars

---

### Task 1: Swap dependencies and type definitions

**Files:**
- Modify: `package.json`
- Modify: `src/app.d.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: None
- Produces: `openai` package installed; `Platform.env.INFERENCE_COOP_API_KEY` and `Platform.env.KAGI_API_KEY` typed

- [ ] **Step 1: Remove `@anthropic-ai/sdk`, add `openai`**

In `package.json` dependencies, replace `"@anthropic-ai/sdk": "^0.67.0"` with `"openai": "^4.77.0"`.

- [ ] **Step 2: Install new dependency**

Run: `bun install`  
Expected: `openai` installs, `@anthropic-ai/sdk` removed from `node_modules`

- [ ] **Step 3: Update `src/app.d.ts`**

Add `INFERENCE_COOP_API_KEY: string;` and `KAGI_API_KEY: string;` to the `Platform.env` interface. Remove `ANTHROPIC_API_KEY`.

- [ ] **Step 4: Update `.env.example`**

Replace the Anthropic block with:
```
# Inference Cooperative API Key
# Get your key from: https://dashboard.inference.coop
INFERENCE_COOP_API_KEY=your_key_here

# Kagi API Key (Fast Search)
# Get your key from: https://kagi.com/settings
KAGI_API_KEY=your_kagi_key_here
```

- [ ] **Step 5: Verify build**

Run: `bun run build`  
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/app.d.ts .env.example
git commit -m "chore: swap Anthropic SDK for OpenAI SDK, add inference.coop + Kagi env types"
```

---

### Task 2: Rewrite `/api/generate-insight` with Kagi + inference.coop

**Files:**
- Modify: `src/routes/api/generate-insight/+server.ts`

**Interfaces:**
- Consumes: `INFERENCE_COOP_API_KEY`, `KAGI_API_KEY` from `platform.env`
- Produces: Same JSON response shape: `{ topic, insight, recommendedTopics, sources, cached?, ageMinutes? }`

- [ ] **Step 1: Replace imports**

Remove `import Anthropic from '@anthropic-ai/sdk'`. Add `import OpenAI from 'openai'`.

- [ ] **Step 2: Add Kagi search helper**

Add a typed helper function `kagiSearch(query: string, apiKey: string)` that:
- POSTs to `https://kagi.com/api/v0/fastsearch`
- Sets `Authorization: Bot ${apiKey}` header
- Returns `Promise<Array<{ url: string; title: string; snippet: string }>>`
- If response is not ok or empty, returns empty array (graceful fallback)

- [ ] **Step 3: Rewrite the POST handler — key checks**

Replace the Anthropic key check with checks for both `INFERENCE_COOP_API_KEY` and `KAGI_API_KEY`. Return `500` with `{ error: 'AI inference API key not configured' }` or `{ error: 'Search API key not configured' }` as appropriate.

- [ ] **Step 4: Rewrite the POST handler — Kagi search call**

Before the LLM call, call `kagiSearch(topic, KAGI_API_KEY)`.

- [ ] **Step 5: Rewrite the POST handler — inference.coop call**

Replace the Anthropic `messages.create` call with:
```typescript
const openai = new OpenAI({
  apiKey: INFERENCE_COOP_API_KEY,
  baseURL: 'https://gateway.inference.coop/v1'
});

const completion = await openai.chat.completions.create({
  model: 'greenpt/deepseek-v4.1-flash',
  max_tokens: 500,
  temperature: 1,
  messages: [
    {
      role: 'user',
      content: buildPrompt(topic, searchResults, context)
    }
  ]
});
```

Where `buildPrompt` assembles the existing Casey context + search results into a single user message with the same instructions (single concise factual statement, Related topics, CRITICAL RULES, EXAMPLES).

- [ ] **Step 6: Parse completion response**

Extract `completion.choices[0].message.content` and parse the same way: split on `Related topics:` to get `insightText` and `recommendedTopics`. Build `sources` from Kagi search results (or from any URLs in the response if the model cites them).

- [ ] **Step 7: Preserve KV caching logic**

Keep the cache read at the top and cache write at the bottom unchanged (same `cacheKey`, same TTL, same response shape).

- [ ] **Step 8: Verify build**

Run: `bun run build`  
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add src/routes/api/generate-insight/+server.ts
git commit -m "feat: migrate generate-insight to inference.coop + Kagi"
```

---

### Task 3: Rewrite `/api/update-document` with inference.coop

**Files:**
- Modify: `src/routes/api/update-document/+server.ts`

**Interfaces:**
- Consumes: `INFERENCE_COOP_API_KEY` from `platform.env`
- Produces: Same SSE stream shape: `{ type: 'edit' }`, `{ type: 'done', document }`, `{ type: 'error' }`

- [ ] **Step 1: Replace imports**

Remove `import Anthropic from '@anthropic-ai/sdk'`. Add `import OpenAI from 'openai'`. Remove the `handleTextEditorTool` helper entirely.

- [ ] **Step 2: Rewrite the POST handler — key check**

Replace Anthropic key check with `INFERENCE_COOP_API_KEY`. Return generic "AI inference API key not configured" error.

- [ ] **Step 3: Rewrite the document generation loop**

Replace the Anthropic `messages.create` + iterative tool-use loop with a single call:
```typescript
const completion = await openai.chat.completions.create({
  model: 'greenpt/glm-5.3-flash',
  max_tokens: 2000,
  messages: [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(topic, insight, currentDocument) }
  ],
  stream: true
});
```

Where the prompt asks the model to produce the updated full document in plain text (no markdown, max 150 words, 2 paragraphs, concise, targeted edits).

- [ ] **Step 4: Stream the response**

Collect streamed chunks into a `newDocument` string. Then, in the same SSE stream:
1. Send a single `type: 'edit'` event with `old_text: currentDocument, new_text: newDocument`
2. Send `type: 'done'` with `document: newDocument`

The stream shape (same event types, same JSON fields) must remain compatible with the front-end `PersistentDocument` component.

- [ ] **Step 5: Preserve KV caching logic**

Keep cache read at top and cache write at bottom unchanged.

- [ ] **Step 6: Verify build**

Run: `bun run build`  
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/routes/api/update-document/+server.ts
git commit -m "feat: migrate update-document to inference.coop"
```

---

### Task 4: Update front-end error strings

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: None (cosmetic only)
- Produces: Generic error messages compatible with any backend

- [ ] **Step 1: Replace "Claude" references**

In the `handleTopicClick` method, replace:
- `"Claude API key not configured"` → `"AI inference API key not configured"`
- The `**Note:**` block about adding `ANTHROPIC_API_KEY` to `.env` → generic text about adding API keys

- [ ] **Step 2: Verify build**

Run: `bun run build`  
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "chore: genericize AI error messages for inference.coop"
```

---

### Task 5: Final verification (whole-branch)

**Files:**
- All modified files above

- [ ] **Step 1: Build check**

Run: `bun run build`  
Expected: Clean build, no warnings or errors.

- [ ] **Step 2: Typecheck**

Run: `bun run check`  
Expected: `svelte-check` passes with no errors.

- [ ] **Step 3: Commit if any fixes**

If either step needed fixes, commit them.
