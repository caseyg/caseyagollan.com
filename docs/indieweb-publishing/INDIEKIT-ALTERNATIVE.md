# Alternative proposal: extend IndieKit instead

Status: planning only, written 2026-11-17. Casey asked for this as a second proposal, to compare against [STARTER-PLAN.md](STARTER-PLAN.md), the plan for our own IndieKit-shaped kit (which Casey chose on 2026-11-17). Nothing here is built.

The idea: instead of a new kit, make [IndieKit](https://getindiekit.com/) able to do everything this site does. Contribute core changes upstream, publish the rest as IndieKit plugins, and run this site's publishing on IndieKit again.

## What IndieKit is today

From the docs (version 1.0.0-beta.31):

- **Runtime.** A Node.js (v24.17+) Express server, started with `npx indiekit serve` or in Docker. The setup wizard writes a `Dockerfile` and `docker-compose.yml`.
- **Database.** MongoDB is optional, but without it you can't view, edit, delete or restore published posts, can't syndicate, and can't manage uploaded media. Plugins add collections with `Indiekit.addCollection`.
- **Sign-in.** A password set at `/auth/new-password`, with a `SECRET` that signs tokens. Micropub clients authorize through IndieKit's own IndieAuth pages.
- **Plugins.** A plugin is a class with `init(Indiekit)`, which calls one of these:
  - `addEndpoint`: `mountPath`, `routes()`, `routesPublic()` and `routesWellKnown()` return Express routers, plus navigation and shortcut items for the web interface.
  - `addStore`: `createFile(path, content, {message})`, `readFile(path)`, `updateFile(path, content, {message, newPath})`, `deleteFile(path, {message})`, and `info { name, uid }`.
  - `addPreset`: `info.name`, `postTypes` (default paths and URLs), and `postTemplate(jf2Properties) → string`.
  - `addSyndicator`: `info { name, uid, checked, service, user }`, and `syndicate(jf2Properties, publication) → url string`.
  - `addPostType`
  - `addCollection` (MongoDB)
- **Admin UI.** Server-rendered Nunjucks views. Plugins can ship `views/`, `includes/`, `locales/` and a homepage widget.
- **Syndication.** Not automatic. The syndicate endpoint (`POST /syndicate?token=…`) works through published posts that still have targets to reach, one at a time, and refuses to run twice at once. It is usually called by a "deploy succeeded" webhook from the static host, which documents this for Netlify. In effect, that is our `post.public` rule.

This site ran on IndieKit until November 2026, which is why `wrangler.jsonc` still names `kit.caseyagollan.com` as the introspection endpoint. The content repo's file layout began as IndieKit output.

## What fits as-is, what needs a plugin, what needs a core change

| Feature (PR) | In IndieKit today? | Under this proposal |
| --- | --- | --- |
| Micropub create, update, delete, undelete, source | Yes (`endpoint-micropub`) | Use it |
| Media endpoint, S3/R2 media store | Yes (`endpoint-media`, `store-s3`) | Use it. R2 speaks S3. |
| IndieAuth server | Yes, with a password | **Core PR:** passkey (WebAuthn) sign-in as an option beside the password |
| GitHub content store | Yes (`store-github`) | Use it. **Core PR:** conditional writes (pass the file's SHA so a stale edit fails), which `updateFile` can't express today |
| Drafts in a private repo (143) | Drafts exist, kept in the same store | **Core PR:** a separate store for drafts, or post status per store |
| This site's file layout | Presets for Eleventy, Hugo, Jekyll | **New plugin:** `preset-caseyagollan` (or a configurable Markdown preset), with `postTemplate` handling `_micropub*` keys and `htmlToMarkdown` with the `sameRendering` check |
| Markdown-first content (148) | Presets write Markdown | Fits the preset |
| Mastodon and Bluesky syndication | Yes (`syndicator-mastodon`, `syndicator-bluesky`) | **Core PR: syndicator v2** (below), then upgrade both upstream plugins |
| Threads (203), up to 4 photos with alt text (204), native quotes (218) | One post per service and one URL back. Some syndicators already send photos; none do threads or native quotes. | Needs syndicator v2 |
| Bluesky OAuth with app-password fallback (221) | App password | Upstream PR to `syndicator-bluesky`. Tokens go in a MongoDB collection. |
| Link cards, linked mentions on Bluesky (142) | Partly | Upstream PR to `syndicator-bluesky` |
| Standard.site records | No | **New syndicator plugin.** Needs v2's `update` and `delete`. |
| Slug renames with redirects (198) | `mp-slug` on create | **Core PR:** `mp-slug` on update, moving the file (`updateFile` already takes `newPath`) and recording old URLs |
| `q=category`, `q=contact`, person tags (212) | `q=category` yes; `q=contact` no | **Core PR:** a hook for plugins to register Micropub queries and properties. Then a `contacts` plugin. |
| `syndication-thread` and `syndication-photo-post` properties | No | Same hook, plus the [proposal doc](proposals/micropub-syndication-threads.md) |
| Post listing (`q=source` list) | Yes | Use it |
| Automatic delivery after the build is live | Syndicate endpoint plus a deploy webhook | Fits. Cloudflare Workers Builds would call `/syndicate` after deploy. **Core PR:** resumable progress per post. |
| Webmention send | Not in the official plugin list | **New plugin**, or a core PR into the syndicate step |
| Webmention archive and moderation | `endpoint-webmention-io` shows mentions live | **New plugin:** store mentions in MongoDB, with moderation |
| Native Mastodon and Bluesky backfeed | No | Part of syndicator v2 (`readInteractions`), run by the scheduler |
| PESOS from Mastodon, Bluesky, GitHub, Are.na (217) | No | **Core PR: scheduler.** Then one importer plugin each. |
| WebSub ping, sitemap (211) | No | **New plugin** on the scheduler (WebSub). The sitemap stays in the site. |
| Buttondown signup and theme (205) | No | **New endpoint plugin** |
| Composer, editor, syndicate page (143–199) | IndieKit's own Nunjucks forms | Keep ours in SvelteKit as a **Micropub client** of IndieKit, like Quill. Optionally contribute the ideas to IndieKit's UI. |
| h-card and rel=me (206), feeds, tag pages, everything visual | Not IndieKit's job | Stays in the site |
| Library, wiki, tables, home graph, Readwise, Raindrop | Not IndieKit's job | Stays in the site |

Roughly a third already exists, a third needs new plugins, and a third needs core changes.

## Core changes to propose upstream

Each would start as an issue on [getindiekit/indiekit](https://github.com/getindiekit/indiekit), written like our [Micropub proposals](proposals/), before any code.

1. **Syndicator v2.** Keep `syndicate()` returning a URL, so existing plugins keep working. Add optional methods:
   - `plan(properties) → parts[]` for threads, photo assignment and quotes.
   - `send(part, progress) → { url, id }` so a half-sent thread can resume.
   - `update(properties, sent)` and `delete(sent)`.
   - `readInteractions(sent)` for backfeed.
   - `limits` (characters, photos, alt text, bytes).

   Core keeps per-post, per-service receipts in MongoDB and writes every sent URL into `syndication`. This is the largest change and the most useful to other IndieKit users.
2. **Scheduler.** `Indiekit.addTask({ name, every, run })`, run in-process, plus a `POST /tasks/:name?token=` route for hosts that sleep or scale to zero. PESOS, backfeed, Webmention archive and WebSub all need it.
3. **Micropub extension hooks.** `Indiekit.addMicropubQuery(name, handler)` and `addMicropubProperty(name, validate)`, listed in `q=config`.
4. **Conditional store writes.** Optional `{ ifRevision }` on `updateFile` and `deleteFile`, and a `revision` returned from `readFile`.
5. **Passkey sign-in.** WebAuthn as an alternative to the password.
6. **Separate drafts store and `mp-slug` on update.**

## How this site would run

```
caseyagollan.com (Cloudflare Worker, SvelteKit)
  public pages, feeds, library, wiki, tables, composer UI
  │  Micropub + IndieAuth (HTTP)
  ▼
kit.caseyagollan.com (IndieKit in Docker)
  endpoints, stores, syndicators, importers, tasks
  │                      │
  ▼                      ▼
GitHub content repo     MongoDB (tokens, receipts, archives)
R2 via S3 for media
```

- **Where IndieKit runs.** It needs a long-running Node process with MongoDB, so it can't run on a plain Worker. It could run:
  - in a container on Fly, Railway or Render, with MongoDB Atlas, or FerretDB (the MongoDB protocol over Postgres or SQLite) so the database can be ordinary Postgres or SQLite;
  - on Cloudflare Containers, which runs Docker images next to Workers, so the account stays the same;
  - on Cloudron, YunoHost or Co-op Cloud from one image, which helps the community-hosting goal.
- **Vercel and Netlify** can run an Express app as a function, but a scheduler and a long-lived MongoDB connection fit them badly. They would rely on the `POST /tasks` route and Atlas. Workable, but not their strength.
- **This site's code.** `src/lib/server/publishing/`, `indieauth/`, the cron jobs in `worker.mjs`, and most of `wrangler.jsonc`'s publishing settings go away. The composer, editor and syndicate pages stay, as a Micropub client of `kit.caseyagollan.com`.

## Plan, in phases

**Phase 0: talk to the maintainer.** Open issues for syndicator v2, the scheduler and the Micropub hooks, linking this site's working versions as reference. Ask whether they fit IndieKit's direction and how upstream wants to receive them. If the answer is no or "not soon", stop and fall back to STARTER-PLAN.md.

**Phase 1: plugins that need no core change.** Publish the preset for this site's layout, Buttondown, Standard.site (single records only), WebSub (token-triggered) and the Webmention archive as community packages. Run IndieKit against a copy of the content repo and post with Quill.

**Phase 2: core pull requests.** Syndicator v2 first, then conditional writes, the scheduler and the Micropub hooks. Upgrade the Mastodon and Bluesky syndicators to v2 with threads, photos, quotes and OAuth. Then add the importers and backfeed.

**Phase 3: move this site.** Deploy IndieKit (Cloudflare Containers or Fly), copy syndication receipts into MongoDB so nothing posts twice, and point the site's discovery links and composer at it. Keep the current Worker endpoints read-only for a week as a fallback, then remove them.

**Phase 4: community packaging.** Docker image, Cloudron and YunoHost packages, and a guide for running IndieKit beside a SvelteKit site, all contributed back.

Exit check for each phase: Quill, the site's composer and IndieWebify all pass, and the syndication receipts show no duplicates.

## IndieKit's ancestors, and what happened to them

IndieKit's README credits five earlier projects. All of them were one person's server for one person's static site:

| Project | Author | Shape | What happened |
| --- | --- | --- | --- |
| [Mastr Cntrl](https://github.com/vipickering/mastr-cntrl) | Vincent Pickering | Node service on Heroku. One of a suite of microservices (Micropub in; [mc-syndication](https://github.com/vipickering) and webmentions separate). Committed Markdown to GitHub, and Netlify rebuilt the Jekyll site. | By 2019 its author called it "a bit of a black box monolith" with a suspected race condition, and considered splitting it into Netlify/Lambda functions. No activity found after 2020. |
| [micropub-endpoint](https://github.com/muan/micropub-endpoint) | Mu-An Chiou | Small Node server (Heroku button, Glitch demo) that commits Jekyll posts through the GitHub API, with a separate GitHub-auth service | Archived December 2022 |
| [Micropub to GitHub](https://github.com/voxpelli/webpage-micropub-to-github) | Pelle Wessman | Express endpoint committing to GitHub for Jekyll | No partial updates or deletes. Last real code change 2023 (see [PROJECTS.md](PROJECTS.md)). |
| [Postr](https://github.com/grantcodes/postr) | Grant Richmond | `@postr/core`, a Micropub endpoint mounted as Express middleware. RxDB storage (LevelDB by default), Webmention sending, image resizing, mf2 fetching. "Extensible via middleware", no plugin system. | No releases. 25 open issues and 6 open PRs. |
| [SiteWriter](https://github.com/gerwitz/sitewriter) | Hans Gerwitz | Ruby and Sinatra service, forked from Barry Frost's Transformative, that gives static sites endpoints. Per-domain config, templates, GitHub store, external IndieAuth token endpoint. | 45 open issues. Paul Robert Lloyd used it and Micropub to GitHub before writing IndieKit, because "neither was flexible enough for my needs". |

Two lessons:

1. **Being general is what lasted.** IndieKit outlived the others because it was built for other people's sites from the start: presets for any generator, stores for any Git host, and a plugin API. A kit that only fits caseyagollan.com would go the way of the five above. That's why the chosen plan's Phase 2 requires a second site run by someone else.
2. **The split recurs.** Every one of them ran as a separate service beside a static site. Mastr Cntrl's author wanted to break it into functions. Our design is that wish carried through: functions over platform storage, mounted in the site itself or run beside it.

## Is the core different enough to justify a new project?

A new project is only justified if the differences are in the core, meaning things IndieKit can't adopt without breaking its plugins or its stated design. Features alone don't count: they can be added to IndieKit.

| Difference | Core or additive? | Why |
| --- | --- | --- |
| **Runtime:** web-standard `fetch` handlers on Workers, Vercel and Netlify, vs a long-running Node and Express server | **Core** | IndieKit's endpoint plugins return Express routers (`routes()`, `routesPublic()`), and its author describes endpoint plugins as Express middleware. Moving to web-standard handlers would break every endpoint plugin. |
| **State:** platform primitives (blob with conditional writes, transactional state, leases) vs MongoDB collections | **Core** | `addCollection` is the plugin storage API, and the features that need state assume MongoDB. Swapping it is a rewrite of the storage layer and every plugin that uses it. |
| **Deployment:** one deploy inside the site, free-tier Workers, no database vs a second server plus a database | **Core** (follows from the two above) | This is the practical reason for the whole effort: $0–5 a month, nothing extra to run, and branch previews of the publishing stack itself. |
| **Language and UI stack:** TypeScript and Svelte vs JavaScript and Nunjucks | **Cultural** | IndieKit avoids TypeScript on purpose, to keep contributing simple. That's a valid choice, not a gap, but it means our code can't go upstream as-is. |
| Syndicator v2 (threads, photos, quotes, resume, update, delete, backfeed) | Additive | It can sit beside `syndicate()` without breaking anything |
| Scheduler, importers, interactions, newsletter, WebSub | Additive | New plugin kinds |
| Micropub query and property hooks | Additive | A new registration call |
| Passkeys, drafts store, slug renames, conditional writes | Additive | Options on existing pieces |

**Verdict: yes, but narrowly.** The runtime, the state model and the deployment shape are real core differences. IndieKit can't adopt them without becoming a different project, and they are what makes this site cheap and simple to run. Everything else, including most of what makes the site's publishing good (threads, photos, quotes, backfeed, the Micropub extensions), is additive and belongs upstream as much as here.

So the new project's identity should be **"IndieKit's plugin model, on web-standard runtimes"**, not "a better IndieKit". In practice:

- **Before starting Phase 0**, open a conversation with IndieKit's maintainer. Share this assessment and ask whether a web-standard runtime would interest the project, either as a future IndieKit core or as a sibling. If it would, the chosen plan becomes a contribution rather than a fork.
- Send the additive pieces upstream as proposals (syndicator v2, Micropub hooks), whatever the answer.
- Keep plugin compatibility both ways where the runtime allows: the chosen plan's IndieKit adapter, and IndieKit-compatible file layouts.
- Accept the maintenance cost on purpose. The five projects above show what happens otherwise: plan for a second site, contract tests and a small core from the start.

## Side by side with the chosen plan

| | Own kit (STARTER-PLAN.md, chosen) | Extend IndieKit (this doc) |
| --- | --- | --- |
| Runtime | Web-standard functions. Workers, Vercel, Netlify, Node | Node and Express. A container everywhere. |
| State | Platform primitives: R2 and a Durable Object today | MongoDB, or FerretDB on Postgres or SQLite |
| Running cost for this site | The current Worker, $0–5 a month | Worker plus a container plus a database, roughly $5–15 a month |
| Deploys | One (the site) | Two (the site and IndieKit) |
| Sign-in | Passkeys today | Password until the passkey PR lands |
| Community | Starts at zero users | Joins an existing project, its users and its plugins |
| Control over pace | Full | Depends on upstream review. Core changes could take months or be declined. |
| Work to reach today's features | Extraction and refactoring of working code | Rewriting about two thirds of the features as IndieKit plugins and core PRs |
| Risk | Maintaining a new project alone | Upstream fit and timing. Losing Workers-native features (Durable Object auth, R2 conditional writes). |
| Benefit to the wider IndieWeb | A new option on Workers | Improves the tool many people already use |

## A middle path

The two plans aren't exclusive. Without changing the chosen plan, we could:

- Propose **syndicator v2** and the **Micropub hooks** to IndieKit anyway, as design issues that link our working code. If they land, IndieKit users get threads, photos and backfeed, and our kit's IndieKit adapter can wrap them directly.
- Build the chosen plan's **IndieKit compatibility adapter** early, so IndieKit's store and syndicator plugins run inside our kit, and our plugins could be offered back as IndieKit plugins where they don't need Workers.
- Keep our presets compatible with IndieKit's file layouts (already in the plan), so a site can move between the two freely.

My recommendation stays with the chosen plan, plus the first bullet of the middle path. It costs a few issues and shares the parts that would help IndieKit most, without betting this site's publishing on upstream timing.
