# Prior art to check before building the kit

Researched 2026-11-17, before any extraction work. Sources:
- the IndieWeb wiki's [Micropub/Servers](https://indieweb.org/Micropub/Servers) page;
- GitHub topics `micropub`, `indieweb`, `webmention`, `posse` and `pesos`, filtered to repositories pushed since mid-2025;
- [research/INVENTORY.md](research/INVENTORY.md), the 19 repositories already reviewed on 2026-11-06.

Companion to [STARTER-PLAN.md](STARTER-PLAN.md) and [INDIEKIT-ALTERNATIVE.md](INDIEKIT-ALTERNATIVE.md), which covers IndieKit and its five ancestors.

Repository facts (stars, status, licences) are from each project's GitHub page on that date. None of the code below was run.

## The one that matters most: davidwkeith/workers

[davidwkeith/workers](https://github.com/davidwkeith/workers) was already in our November 6 survey as "the strongest native Workers package candidate". It has grown a lot since. It is now a monorepo of Cloudflare Workers packages for the open web. Its README says all of them are implemented but unreleased (version 0.0.0, nothing on npm), with micropub.rocks and webmention.rocks conformance runs gating 1.0.

- **Protocol endpoints:** `indieauth` (PKCE, token, metadata), `micropub` (with media, R2), `webmention` (send and receive, with a verification queue), `microsub`, `websub` (a full hub), `webfinger`, `host-meta`, `activitypub`, `mastodon-api`, `atproto-pds` (exploratory), `solid-pod`, `remotestorage`, `webdav`, `vc` (did:web), and `webauthn` (exploratory).
- **Libraries:** `mf2` (microformats to JF2, using `HTMLRewriter`), `safe-fetch` (SSRF-safe fetch), `dpop`, `oauth`, `http-signatures`, `mcp` (a Model Context Protocol core that endpoint packages add tools to), and `log`.
- **Other runtimes:** `cf-shims` implements D1, R2, KV, Queues and Durable Objects on Node. `deno-host` (exploratory) does the same for Deno.
- **Storage:** D1, R2, Durable Objects and Queues. Content lives in D1, not Git.
- **First consumer:** [Anglesite](https://github.com/Anglesite/anglesite-skills), by the same author (ISC licence), which "scaffolds, designs, and deploys Astro sites on Cloudflare Workers", with Keystatic for editing and an IndieWeb skill that sets up IndieAuth, Webmention and Micropub.

Compared with our plan:

| | davidwkeith/workers | Our kit (planned) |
| --- | --- | --- |
| Runtime | Workers-native, with Node and Deno shims for Cloudflare's bindings | Web-standard, with a platform plugin per host |
| Content store | D1 | Git and Markdown (GitHub first), with others as plugins |
| Protocol breadth | Very wide (ActivityPub, Solid, atproto, Microsub, a WebSub hub) | Narrower (Micropub, IndieAuth, Webmention, WebSub ping) |
| POSSE to Mastodon and Bluesky (threads, photos, quotes) | Not listed | Core strength |
| PESOS importers, backfeed | Not listed | Core strength |
| Owner composer | Keystatic via Anglesite | Our Svelte composer |
| Plugin model | Separate packages mounted under path prefixes, sharing libraries | IndieKit-style plugin kinds with a manifest |
| Status | 543 commits, 3 stars, unreleased | Working code in one site, not extracted |

**What this means.** It overlaps most of our planned core at the protocol level, and it's further along on breadth. It lacks most of what's distinctive about this site: Git-backed Markdown, POSSE with threads and photos, PESOS and backfeed. The two look complementary rather than competing.

Two ideas worth taking whether or not we collaborate:

1. **Cloudflare's bindings as the portable interface.** Its `cf-shims` makes D1, R2, KV, Queues and Durable Objects work on Node, instead of defining a new abstraction. Our plan defines `BlobStore`, `StateStore` and leases. Shimming R2 and Durable Objects on Vercel, Netlify and Node is a real alternative. It's less to design, and the Cloudflare code stays native. It fits Cloudflare's stated aim, after the Deno team joined, of making Workers easier to run elsewhere. The cost is that every non-Cloudflare host has to emulate Durable Object semantics.
2. **MCP tools contributed by each endpoint package.** A plugin that adds a Micropub capability also adds the matching agent tool. That would let Claude, or any agent, post, edit and syndicate through the kit with the same scopes as Micropub.

## Other projects worth knowing

### Endpoints and toolkits

| Project | What it is | Take or leave |
| --- | --- | --- |
| [hacdias/indielib](https://github.com/hacdias/indielib) | Go toolkit: IndieAuth, Micropub and Microformats handlers where you supply storage. 54 stars, active. | Reference for clean handler and storage seams. Different language. |
| [benjifs/micropub](https://github.com/benjifs/micropub) | Serverless Micropub and media endpoints for static sites (Netlify Functions). Rewritten in 2025, active. | Already reviewed. Reference for the Netlify platform plugin. |
| [voxpelli/node-micropub-express](https://github.com/voxpelli/node-micropub-express) | Express route for Micropub | Leave. Express-bound. |
| [grantcodes/postr](https://github.com/grantcodes/postr) | Express middleware with RxDB storage | Leave (see INDIEKIT-ALTERNATIVE.md) |
| [dumaurier/ElevindieWeb](https://github.com/dumaurier/ElevindieWeb) | Eleventy IndieWeb starter with IndieAuth, Micropub and syndication built in | Already reviewed. Useful as a model for the sidecar starter. |
| [getindiekit/indiekit-quickstart](https://github.com/getindiekit/indiekit-quickstart) | IndieKit plus an Eleventy theme on any Docker host in five steps | Model for our Docker and self-host quickstart |
| [aaronpk/micropub.rocks](https://github.com/aaronpk/micropub.rocks), webmention.rocks | Conformance test suites | **Take.** Run them in the kit's contract tests, as davidwkeith/workers plans to. |
| Wiki-listed personal endpoints: Last Crusader (Elixir, Hugo via GitHub), nanopub (PHP, Hugo), capjamesg/micropub (Flask), neopub, Netlify micropub by Aura Everitt, blotpub (Dropbox for Blot), micropub-go (unreleased) | Single-site endpoints | Leave. Same pattern as IndieKit's ancestors. |
| Clodd CMS (2026), Pagecord, Pika, kirby-micropub (Kirby 5), WordPress Micropub | Micropub built into a CMS or hosted platform | Leave. Interop targets, not foundations. |

### Whole blog engines with IndieWeb built in

| Project | What it is | Take or leave |
| --- | --- | --- |
| [joiha-steven/quireink](https://github.com/joiha-steven/quireink) | TypeScript (Bun and Hono) blog engine on SQLite. Runs on Cloudflare Workers (paid plan), Docker or a NAS. Mastodon syndication, an MCP server for agents, themes without code. 42 stars, very active. | Leave the code: since v2 it's under PolyForm Noncommercial, which is not open source. The deployment story (one engine on Workers or Docker) shows there's demand. |
| [idno/idno](https://github.com/idno/idno) (Known) | PHP social publishing platform, 1,127 stars, still active | Reference for content types as plugins |
| [svandragt/lamb](https://github.com/svandragt/lamb), [soloblog](https://github.com/soloblog/soloblog) | Single-user PHP and Python blogs with Micropub | Leave |
| [teleclimber/Dropserver](https://github.com/teleclimber/Dropserver) | Go platform for personal web services (sandboxed apps) | Reference for the self-host packaging story |

### POSSE, PESOS and backfeed

| Project | What it is | Take or leave |
| --- | --- | --- |
| [snarfed/granary](https://github.com/snarfed/granary), [Bridgy](https://brid.gy), [Bridgy Fed](https://github.com/snarfed/bridgy-fed) | Python silo translators and bridges, very active | Reference for edge cases in each network's format. Optional service plugins for other kit users. |
| [ggirelli/inter-pull](https://github.com/ggirelli/inter-pull) | TypeScript library that collects interactions from Bluesky, Mastodon and Hacker News. MIT, 12 commits. | Small, but compare with our `backfeed.ts`. Hacker News is an interaction source we don't have. |
| [pcmhatre/Masto2Pika](https://github.com/pcmhatre/Masto2Pika) | PESOS from Mastodon to a Micropub blog that stitches self-reply threads into one post | Same idea as our threads, in reverse. Check how it maps a thread back onto one post. |
| [EthanPlant/Elsewhere](https://github.com/EthanPlant/Elsewhere) | Rust CLI for POSSE from static sites, rendering per-platform versions | Reference for per-network rendering (our syndicator `plan()`) |
| [rknightuk/echo](https://github.com/rknightuk/echo) (EchoFeed) | Posts RSS feeds to Micro.blog and Mastodon | Casey used it in 2025 before IndieKit. It's the "POSSE from feed" pattern, a possible lightweight syndicator mode. |
| [dewey/kirby-posse](https://github.com/dewey/kirby-posse), [dshanske/syndication-links](https://github.com/dshanske/syndication-links) | CMS POSSE plugins | Leave |

### Clients and composers

| Project | What it is | Take or leave |
| --- | --- | --- |
| [courtneyr-dev/outpost](https://github.com/courtneyr-dev/outpost) | Mobile-first PWA composer for POSSE workflows, active | Compare with our composer's mobile layout |
| [benjifs/sparkles](https://github.com/benjifs/sparkles), [barryf/micropublish](https://github.com/barryf/micropublish), [Omnibear](https://github.com/omnibear/omnibear), [rmdes/plume](https://github.com/rmdes/plume) | Micropub clients and browser extensions | Test targets for the kit's Micropub conformance |
| [jorritvanderheide/obsidian-in-the-open](https://github.com/jorritvanderheide/obsidian-in-the-open), [svemagie/obsidian-micropub](https://github.com/svemagie/obsidian-micropub) | Obsidian to Micropub | Relevant to cag.wiki. Posting from Obsidian needs no kit work beyond Micropub. |
| [rmdes/micropub-mcp](https://github.com/rmdes/micropub-mcp), [jthingelstad/mb](https://github.com/jthingelstad/mb) | MCP servers for Micropub and Micro.blog | Points to the same agent-posting idea as `@dwk/mcp` |

### A direction worth noting: content in an atproto PDS

[barryf/barryfrost-v7](https://github.com/barryf/barryfrost-v7): Barry Frost archived [Vibrancy](https://github.com/barryf/vibrancy), his serverless Micropub CMS on AWS, in August 2026. His new site is static Astro on Cloudflare Workers:
- Articles stay as Markdown in Git.
- Check-ins, films, books, photos and Bluesky posts are read at build time from his AT Protocol PDS, through custom Astro loaders.
- A cron Worker polls the PDS and triggers a rebuild.
- Images are resized into R2.

There's no Micropub: other apps write records to the PDS, and the site reads them. For the kit, that suggests a **PDS importer** (PESOS from atproto lexicons, not just Bluesky posts). It also fits the Standard.site work, where the site writes records to the PDS. The kit could treat the PDS as both a syndication target and a source.

## What changes in the plan

1. **Before Phase 0, contact davidwkeith/workers as well as IndieKit.** The most promising option is to build on its protocol packages (`indieauth`, `webmention`, `mf2`, `safe-fetch`, `dpop`, `websub`) where they fit, and contribute what it lacks: a Git and Markdown store for its Micropub, POSSE syndicators, PESOS importers and backfeed. That could shrink our core to the plugin model, the outbox and the Git store.
2. **Decide the platform approach:** our own `BlobStore` and `StateStore` interfaces, or Cloudflare's binding interfaces shimmed on other hosts, as in `cf-shims`. Both are workable. Shims mean less design but harder Vercel and Netlify ports.
3. **Contract tests include micropub.rocks and webmention.rocks.**
4. **Add an atproto PDS importer** to the importer list, beside Mastodon, Bluesky, GitHub and Are.na.
5. **Consider MCP tools per plugin**, so agents can publish with Micropub's scopes.
6. **Don't reuse code from quireink.** Its licence is noncommercial.
