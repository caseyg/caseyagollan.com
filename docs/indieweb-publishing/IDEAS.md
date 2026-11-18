# What to build next

Researched November 18, 2026. Sources: the IndieWeb wiki's building blocks, ATmosphere and fediverse project docs, and recent personal sites that shipped these ideas. All links are at the end. The list leaves out what the site already has: Micropub (post listing and syndication threads), the IndieAuth server, h-card/h-entry, sending Webmentions, receiving through webmention.io, POSSE to Mastodon and Bluesky with photos and threads, PESOS from both, RSS/Atom/JSON Feed, Buttondown, Are.na, Raindrop, Readwise bookmark review, the library graph, the cag.wiki browser, tables and Pagefind search.

The live site was checked the same day. `/.well-known/webfinger`, `/sitemap.xml` and `/now` return 404, the feeds have no `rel=hub`, and Webmentions are fetched in the browser from webmention.io, so the site keeps no copy of them.

**Effort:** S is an afternoon, M is one to three days, L is a week or more.

## Status (November 18, 2026)

✅ Built and merged: WebSub hub and sitemap ([#211](https://github.com/caseyg/caseyagollan.com/pull/211)), Webmention archive and moderation ([#213](https://github.com/caseyg/caseyagollan.com/pull/213)), `fediverse:creator` and OpenSearch ([#216](https://github.com/caseyg/caseyagollan.com/pull/216)), per-type and per-tag feeds and On this day ([#219](https://github.com/caseyg/caseyagollan.com/pull/219)).

🔎 In review: `q=category`, `q=contact` and person tags ([#212](https://github.com/caseyg/caseyagollan.com/pull/212)), Standard.site ([#214](https://github.com/caseyg/caseyagollan.com/pull/214)), GitHub and Are.na imports ([#217](https://github.com/caseyg/caseyagollan.com/pull/217)), native quote posts ([#218](https://github.com/caseyg/caseyagollan.com/pull/218)), Mastodon and Bluesky reply backfeed ([#220](https://github.com/caseyg/caseyagollan.com/pull/220)), Bluesky OAuth ([#221](https://github.com/caseyg/caseyagollan.com/pull/221)).

❌ Declined: making the domain a fediverse account, through either Bridgy Fed or native ActivityPub.

## Top picks

| # | Idea | Why | Effort | Status |
|---|------|-----|--------|--------|
| 1 | Keep your own copy of Webmentions | Replies, likes and reposts live only at webmention.io today. If it goes away, so do years of interactions. | M | ✅ #213 |
| 2 | Standard.site records on AT Protocol | Bluesky now shows a richer card for links that point to a `site.standard.document`. Articles become first-class in the ATmosphere and still live here. | M | 🔎 #214 |
| 3 | WebSub hub on every feed | Feed readers (Feedbin, Inoreader, Micro.blog, NewsBlur) get new posts in seconds rather than at their next poll. | S | ✅ #211 |
| 4 | Native backfeed from your syndication links | Every post already stores its Mastodon and Bluesky URLs. Fetching replies from them directly cuts out the dependence on Bridgy and webmention.io. | M | 🔎 #220 |
| 5 | Make the domain a fediverse account | An account like `@caseyagollan.com@caseyagollan.com` would be followable on Mastodon, Threads and others. Bridgy Fed can do it in an afternoon. Doing it natively is bigger. | S to L | ❌ Declined |
| 6 | More PESOS sources | Listens, watches, check-ins and highlights turn the site into the full record of what you read, watch and do. | S to M each | 🔎 GitHub and Are.na in #217 |
| 7 | Small discovery tags | `fediverse:creator`, `human.json`, a sitemap, OpenSearch, and a blogroll/OPML. Each is about an hour. | S | ✅ sitemap #211, fediverse:creator and OpenSearch #216 |

## Protocols

### Webmention

- **Archive incoming mentions (M).** ✅ Built ([#213](https://github.com/caseyg/caseyagollan.com/pull/213)). Use the existing five-minute cron to pull `mentions.jf2?since_id=` from webmention.io into R2 or the content repo. Render them on the server inside the h-entry as `u-comment`, `u-like` and `u-repost`. That gives you a backup, faster pages, and markup other sites can parse. Later you can replace webmention.io with a receiver on the Worker: the R2 outbox already has the lease and retry plumbing for verification.
- **Moderation (S, after archiving).** ✅ Built ([#213](https://github.com/caseyg/caseyagollan.com/pull/213)). Add a hide/block list next to graph curation in `PUBLISHING_STATE`, so spam and abuse can be removed without asking webmention.io.
- **Salmention (S, after archiving).** When a reply to one of your posts gets its own replies, re-send Webmentions upstream so the conversation propagates.
- **Vouch (M).** Accept mentions from unknown domains only when they name someone you link to. This is the IndieWeb's anti-spam approach and fits a receiver you own.
- **Private Webmentions (L).** These carry a code the receiver exchanges for a token. Only worth doing together with private posts (see IndieAuth below).
- **Reacji (S).** Show replies that are a single emoji as reactions rather than comments. Your emoji filters already work this way.

### WebSub

- **Advertise a hub and ping it (S).** ✅ Built ([#211](https://github.com/caseyg/caseyagollan.com/pull/211)). Add `<link rel="hub">` and `<link rel="self">` to the RSS, Atom and JSON feeds and to HTML pages, and ping `pubsubhubbub.appspot.com` or `websubhub.com` after each content deploy. The delivery cron already knows when a revision goes public.
- **Subscriber side (M).** Subscribe to the feeds of people you follow, as the receiving half of a reader (see Microsub).

### Microsub and a social reader

- **A reader inside the site (L).** Aperture and Monocle, the reference implementations, are dated, and Cinnamon was archived in January 2026. A 2026 Indiekit plugin shows the idea is still alive. A Microsub endpoint on the Worker (channels in R2, timelines built by polling plus WebSub) would let you read in Monocle or Indigenous and reply, like and bookmark through your own Micropub. `social-follows.json` can seed the channels. This is the largest item here, but it closes the loop: read, respond, own it.
- **Lighter version (M).** A private `/reader` page that polls a list of h-feeds and RSS feeds, with each item linking to the composer prefilled as a reply, like or bookmark.

### IndieAuth

- **Visitor sign-in (M).** Let readers sign in with their own domain through RelMeAuth or IndieAuth, or with a Mastodon or Bluesky account. It's the basis for anything else that's audience-aware.
- **Private and audience posts (L).** The publishing plan rejects private posts because Git is public. A private store, such as the private drafts repo or R2, plus visitor sign-in would allow `visibility=private` and `audience` posts: friends-only photos, or posts behind a newsletter.
- **Ticket auth (M, after private posts).** IndieAuth's ticket extension lets you grant another site's owner a token to read your private posts in their reader. It's the IndieWeb version of "close friends."
- **`profile` and `userinfo` (S).** Return name, photo and URL from `SITE_IDENTITY` with the token, so clients like Quill Native can show your avatar without parsing HTML.

### Micropub extensions

- **`q=category` (S).** 🔎 In review ([#212](https://github.com/caseyg/caseyagollan.com/pull/212)). Lets clients autocomplete your existing tags. The Readwise importer already suggests them.
- **`q=contact` (S to M).** 🔎 In review ([#212](https://github.com/caseyg/caseyagollan.com/pull/212)). Includes person tags. Builds from `social-follows.json` so clients can person-tag with an h-card. It pairs with `u-category` h-card person tags in posts.
- **`visibility` and `mp-destination` (S each).** Become useful once private posts or a second site exist.
- **Post by email (M).** A Cloudflare Email Routing address that turns mail from your address into a Micropub draft. Photos come from attachments.

### ActivityPub and the fediverse

- **`fediverse:creator` meta tag (S).** ✅ Built ([#216](https://github.com/caseyg/caseyagollan.com/pull/216)). Adding `<meta name="fediverse:creator" content="@caseyg@social.coop">` to post pages puts a clickable author byline under every Mastodon link preview.
- **Bridgy Fed for the web (S).** ❌ Declined. Sign the domain up at fed.brid.gy. It reads your h-entries and the Webmentions you already send, and makes `@caseyagollan.com@caseyagollan.com` a followable account. Replies come back as Webmentions. The catch is a second fediverse identity next to `@caseyg@social.coop`, so decide which one is primary.
- **Native ActivityPub (L).** ❌ Declined. Fedify supports Cloudflare Workers, and the site already runs a Durable Object, which suits follower lists and signed delivery. You'd add WebFinger, an actor, an outbox, an inbox and HTTP signatures. Long-term this could replace POSSE to social.coop, or you could use Mastodon's account-move to point there. Only do this if you want the domain to be your identity. Bridgy Fed covers most of the benefit.
- **Quote posts (S).** 🔎 In review ([#218](https://github.com/caseyg/caseyagollan.com/pull/218)). Mastodon and Bluesky both support quotes now. Syndicating a repost or quote of a post that has a Bluesky or Mastodon URL could send a native quote rather than a link.

### AT Protocol

- **Standard.site (M).** 🔎 In review ([#214](https://github.com/caseyg/caseyagollan.com/pull/214)). On publishing an article, write a `site.standard.document` record to your PDS (and a `site.standard.publication` once) pointing at the canonical URL. Then add the `<link>` tag and well-known file that verify the site owns it. Sequoia does this for static site generators, and the existing Bluesky session code can do it directly. It's the most active idea in the ATmosphere right now.
- **OAuth instead of an app password (M).** 🔎 In review ([#221](https://github.com/caseyg/caseyagollan.com/pull/221)). atproto now treats OAuth as the replacement for app passwords. A confidential client on the Worker, with DPoP (already in the specs folder), narrows what a leaked credential can do. Scopes are still settling, so do it as a migration, not a rewrite.
- **Bluesky reply threads as comments (S).** 🔎 In review ([#220](https://github.com/caseyg/caseyagollan.com/pull/220)). `app.bsky.feed.getPostThread` on the public AppView returns the whole tree for a syndicated post, so you could render nested replies even when backfeed only delivered the top level. Blocks you've made on Bluesky carry over.
- **`did:web` or a self-hosted PDS (L, optional).** The handle is already the domain. Running your own PDS makes the domain own the data, not just the name. It's only worth it if you want Bluesky posts stored here too.

### Other networks (low priority)

- **Nostr (S for identity).** A `/.well-known/nostr.json` gives NIP-05 verification. Anything more isn't worth it unless people you care about are there.
- **Threads.** Meta federates with ActivityPub, so Bridgy Fed or native ActivityPub already reaches it.
- **Micro.blog.** It can follow your feed and send replies as Webmentions. Free to set up.

## Data sources to import (PESOS)

Each one is a new post type in the content repo, imported by the same cron and Git batch as the Mastodon and Bluesky importer.

| Source | Post type | How | Effort |
|---|---|---|---|
| Readwise highlights | quotation (`h-cite` in a note) | The Readwise export API you already have a token for. Bookmarks come in today, highlights don't. | S |
| ListenBrainz or Last.fm | `listen-of` | Public scrobble APIs. Roll up into one daily post so the feed isn't flooded. | S |
| Letterboxd | `watch-of` with rating | The public RSS feed includes ratings and reviews. | S |
| LibraryThing or StoryGraph finishes | `read-of` with `read-status` | You already sync LibraryThing. Emit a post when a book's finished date appears. | S |
| Foursquare Swarm | `checkin` with a venue h-card | OAuth API, as OwnYourSwarm does. The composer has location but no check-in kind. | M |
| GitHub | notes for releases, starred repos as bookmarks | 🔎 In review ([#217](https://github.com/caseyg/caseyagollan.com/pull/217)). GitHub's REST API. | S |
| Podcasts (Overcast or Pocket Casts) | `listen-of` | OPML or history export, so a weekly script rather than a cron. | S |
| Strava or Apple Health workouts | `exercise` / `h-exercise` | Strava's API. A niche post type, so keep it optional. | M |
| Pixelfed or Flickr | photo | ActivityPub outbox or the Flickr API. | M |
| Are.na blocks you add | bookmark | 🔎 In review ([#217](https://github.com/caseyg/caseyagollan.com/pull/217)). It's already in search and tables. Imported blocks would also show in the posts feed. | S |
| Flights (Flighty or TripIt) | itinerary | Email-forward parsing via post by email. The itinerary kind already exists. | M |

Add a matching **Wayback snapshot (S)**: when a bookmark or like is published, call the Internet Archive's Save Page Now API and store `u-archived`, so link rot doesn't break old bookmarks.

## Approaches and pages

- **Backlinks between posts and cag.wiki (M).** The build already fetches the wiki and rewrites its links. Show "mentioned in" on both sides, the digital-garden idea of stream plus garden. Sending Webmentions to wiki pages isn't possible on Obsidian Publish, so do it at build time.
- **Slash pages (S each).** `/now`, `/uses`, `/about`, `/colophon` and `/blogroll` (see slashpages.net). The changelog posts already cover part of `/colophon`.
- **Blogroll and OPML (S).** Publish a subset of `social-follows.json` as `/blogroll` with `rel=blogroll`-style links, plus `/blogroll.opml` people can import.
- **Per-type and per-tag feeds (S).** ✅ Built ([#219](https://github.com/caseyg/caseyagollan.com/pull/219)). For example `/type/photo/feed.xml`, added to `SITE_FEEDS` so the Subscribe menu picks them up. People who only want articles or photos can follow just those.
- **Styled feeds (S).** An XSLT stylesheet so `/feed.xml` reads as a page in a browser and explains what a feed is.
- **Events as iCal (S).** An `.ics` feed of event and RSVP posts that calendars can subscribe to.
- **On this day (S).** ✅ Built ([#219](https://github.com/caseyg/caseyagollan.com/pull/219)). Posts go back to 2018 thanks to PESOS. A daily "on this day" block on the homepage or the day pages.
- **Web actions (S).** "Reply, like or repost from your own site" buttons that open the visitor's Micropub client (indie-action / `web+action`), plus a "reply on Bluesky or Mastodon" link built from the syndication URLs.
- **Permashortlinks (S).** A NewBase60 short URL per post, such as `/s/5Kx1`, for space-limited syndication text. Bluesky's 300-character limit makes this useful.
- **Maps (M).** A map of posts with location or photo EXIF, shown on the day pages and a `/map`.
- **Webrings (S).** The IndieWeb webring (`xn--sr8hvo.ws`) for discovery.

## AI-era signals

- **`human.json` (S).** A 2026 draft that declares a site human-written and lets you vouch for other sites. Adoption is small but growing among IndieWeb blogs. It costs one file and a `<link rel="human-json">`, and `social-follows.json` could seed the vouches.
- **Content-use preferences (S).** Say how crawlers may use the site through `robots.txt` and the IETF AI-preferences vocabulary as it settles, and optionally an `llms.txt` that points to the feeds and the wiki. `robots.txt` currently allows everything.
- **Sitemap and OpenSearch (S).** ✅ Built: sitemap in [#211](https://github.com/caseyg/caseyagollan.com/pull/211), OpenSearch in [#216](https://github.com/caseyg/caseyagollan.com/pull/216). `/sitemap.xml` returns 404 today. Search engines and AI crawlers both use it. An OpenSearch description lets browsers add site search, backed by Pagefind.

## Suggested order

1. Quick wins in one PR: `fediverse:creator`, WebSub ping, sitemap, OpenSearch, `human.json`.
2. Archive Webmentions and render them on the server. Everything about owning interactions builds on this.
3. Standard.site records for articles.
4. Two or three PESOS sources: Readwise highlights, Letterboxd and ListenBrainz are the cheapest.
5. Decide on the domain as a fediverse identity. Try Bridgy Fed first, and go native only if it sticks.
6. The reader: Microsub, visitor sign-in, then private posts.

## Sources

- IndieWeb building blocks: https://indieweb.org/building-blocks
- Microsub spec: https://indieweb.org/Microsub-spec · Social readers: https://indieweb.org/social_reader
- Indiekit Microsub plugin (2026): https://code.rmendes.net/rick/indiekit-endpoint-microsub · Inbound and outbound RSS: https://rmendes.net/articles/2026/06/29/inbound-and-outbound-rss/
- Cinnamon (archived January 2026): https://github.com/capjamesg/cinnamon
- Standard.site in the Bluesky timeline: https://atproto.com/blog/standard-site-bluesky-timeline · Publishing with Standard.site: https://piccalil.li/blog/publishing-on-the-atmosphere-with-standardsite/ · An Eleventy example: https://brennan.day/publishing-my-eleventy-blog-to-the-atmosphere-with-standard-site/
- atproto OAuth: https://docs.bsky.app/blog/tags/oauth · OAuth scopes proposal: https://github.com/bluesky-social/atproto/discussions/3655
- Bluesky comments on a static site: https://graysky.app/blog/2024-02-05-adding-blog-comments
- Bridgy Fed: https://fed.brid.gy · Nonprofit news: https://techcrunch.com/2024/12/17/bridgy-fed-a-project-to-connect-the-open-social-web-is-now-becoming-a-nonprofit
- Fedify on Cloudflare Workers: https://fedify.dev/manual/deploy · ActivityPub on a blog (2026): https://writings.hongminhee.org/2026/07/fedified-blog/ · Workers + D1 + GitHub example: https://github.com/ngs/ap.ngs.io
- `fediverse:creator`: https://blog.joinmastodon.org/2024/07/highlighting-journalism-on-mastodon/ · FEP-2345: https://socialhub.activitypub.rocks/t/fep-2345-fediverse-creator/8844
- `human.json`: https://codeberg.org/robida/human.json · An implementation: https://hamatti.org/posts/new-protocol-proposal-for-indie-web-human-json/

The wiki's recent-changes page needs a login, so very new wiki proposals may be missing here.
