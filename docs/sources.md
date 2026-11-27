# The source cache

The site keeps its own copy of what Casey saves elsewhere (Readwise and Reader, Raindrop, Are.na) so the chat searches all of it in one call and only asks the services themselves for what the copy can't answer. The code is in `src/lib/server/sources/`.

## How it fits together

- **Plugins** (`plugins/*.ts`, listed in `registry.ts`) know one service each. A plugin turns the service's records into the shared `SourceDocument` shape (`types.ts`) a page at a time.
- **The index** (`index.ts`) is one SQLite database: documents, their highlights, a full-text index (FTS5) over titles, whole texts, notes and highlights, the sync state, and the embedding vectors.
- **The store** (`store.ts`) is the `SourceStore` Durable Object (binding `SOURCES`) that holds the index and is the only thing that syncs. The Worker's cron calls `tick()` every five minutes, which only sets the object's alarm: all the work runs in `alarm()`, never inside a caller's request (a caller that goes away takes its call's work with it, which once left a first copy stuck after one page). During a first copy the alarm re-arms itself every second until it is done, or for as long as a service asks it to wait.
- **The sync** (`sync.ts`) runs each plugin a few bounded steps at a time and keeps its cursor between steps, so a run that is cut off loses one step. After a first whole pass, a sync asks each service only for what changed. Each record is also kept whole, as the service sent it, in the private bucket under `private/sources/<source>/<id>.json`.
- **Thin links** (a bookmark or link block with few words of its own) have their page read once (`page.ts`) and its text kept.
- **Likeness** (`embed.ts`): each document's words, and its picture, are embedded with `@cf/google/embeddinggemma-2` on Workers AI (the `AI` binding). Text and pictures share one space, so words find pictures and a picture finds pictures like it. The vectors are stored in the index and compared there. Without the binding, everything else works.
- **Access** (`access.ts`) is the one way the rest of the site reads the copy.

## Memory

The Durable Object shares the Worker's 128 MB with the site's own code, and running out resets it mid-step (this stalled the first live copy). So: Reader pages are 20 documents, and HTML over 150 KB is turned to text without being parsed; a step that never came back is tried again asking for less (`SyncState.cautious`), then given up; pages and likeness are worked on only when nothing is being fetched, one at a time, and each thin link or picture is marked as tried before it is read. A round that never finished is logged as `source_round_died` with what it was doing.

## Privacy

Everything in the copy is private unless a plugin says otherwise (only Casey's own public Are.na blocks are public). The rules live in one place, `SourceIndex`, and `tests/sources-privacy.test.ts` holds them:

- A reader who is not the owner sees only public documents, and never their places or tags.
- `sourcesFor(backend, { owner })` binds the reader; pass `owner: true` only after a session check or in an owner-only chat run.
- The Durable Object has no `fetch` handler. The only route is `/api/sources`, which answers 401 to anyone but the signed-in owner before the copy is touched. A test scans the source tree so a new reader of the copy has to be added to its list on purpose.
- A table or a post that uses a cached document gets a copy of its title, excerpt, address and picture (`sourceBlock`), with no key back into the copy. Publishing the table publishes exactly that.
- Logs carry counts only, never titles or addresses.

## Where it syncs

Production syncs by itself (`SOURCES_SYNC=true` in `wrangler.jsonc`). A branch preview has its own empty copy and syncs only when the owner presses **Sync now** under Connections on `/account`, so previews don't spend the services' rate limits.

## Adding a source

1. Write `plugins/<name>.ts` exporting a `SourcePlugin`: `id`, `name`, `icon`, `configured(env)` and `sync(context, state)`.
2. `sync` does one bounded piece of work (a page of results) and returns a `SyncStep` (with `progress` when the service says how much there is, which the settings page draws as a bar): the documents (each with its `raw` record), an opaque `cursor` for the next step, `done` when the pass is over, and `complete: true` when the pass saw everything the source has (so what was not seen is removed).
3. `state.since` is when the last pass started: ask the service only for what changed after it. `state.full` is when the last whole pass started; `wantsFull(state, now)` in `plugins/http.ts` says when another is due.
4. Fetch with `getJson` from `plugins/http.ts`: it reports a rate limit as `SourceBusy`, and its errors carry only a status, never the service's words.
5. Mark every document `private: true` unless the thing is public on the service and Casey's own.
6. Add the plugin to `SOURCE_PLUGINS` in `registry.ts`, and its token as a Worker secret. It then shows up in search, in `my_saves`, and on `/account`.

## Trying it locally

`bun utils/sources/try.ts sync [source] [rounds]` fills `.sources/index.sqlite` (ignored by git) from the real services, and `search` / `get` read it. `CHAT_EVAL_SOURCES=.sources/index.sqlite bun utils/chat-eval/run.ts saves-topic saves-week saves-read` replays chat questions against it; without the variable the same questions go to the live services, which is the comparison.

Measured on 2026-11-27 with about 5,900 Reader documents and 1,200 Are.na items copied: the three questions took 11.4 seconds, 5.5 tool calls and 39,600 input tokens on average before, and 3.4 seconds, 1.7 calls and 17,200 tokens from the copy. Before, the question that needed an article's text could not be answered; from the copy it was.
