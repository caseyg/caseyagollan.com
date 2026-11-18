# Proposal: tag and contact queries, and person tags, in Micropub

Status: draft, implemented on caseyagollan.com (2026-11, PR 212). `q=category` and `q=contact` are already listed on [Micropub extensions](https://indieweb.org/Micropub-extensions), with open issues on how filtering works ([#5](https://github.com/indieweb/micropub-extensions/issues/5), [#39](https://github.com/indieweb/micropub-extensions/issues/39)) and on discovering them ([#7](https://github.com/indieweb/micropub-extensions/issues/7)). This page records how this site answers those open points, so the choices can go back to those issues as proposals. Extension text is kept in `../specs/core/micropub-extensions.txt`.

## Problem

A client that wants to help someone tag a post needs two lists: the tags the site already uses, and the people the author might mention. The extension list documents the response shape of each, but not how a client narrows a long list, how results are ordered, or how a client learns the queries exist. Person tags have the same gap: the [person-tag](https://indieweb.org/person-tag) convention puts an h-card in `category`, but nothing says what a server keeps from that h-card or how it keeps people apart from topic tags.

## Summary

| Piece | Name | Where |
|---|---|---|
| Existing tags, most used first | `q=category` → `categories` | query (existing) |
| Narrowing either list | `filter` (or `search`), `limit` | query parameters (proposed) |
| People to tag, one per person | `q=contact` → `contacts` | query (existing) |
| A contact's handle on each network | `silos` | contact field (proposed) |
| Which queries the server answers | `q` | `q=config` (issue #7) |
| Tagging a person | h-card or profile URL in `category` | post property (person-tag convention) |

## Changes to the extensions

### Query for category/tag list

```diff
 The following example would be returned as part of the ?q=category query.
+
+A client MAY narrow the list with filter. The server SHOULD return only categories
+that contain the filter text, compared without case or accents, and ignoring a
+leading # in the filter. A server SHOULD also accept search as the same parameter.
+
+The server SHOULD order categories by how many posts use them, most used first,
+and when filtering SHOULD list those where a word starts with the filter before
+those that only contain it. Categories that differ only in case SHOULD be returned
+once, in the most used spelling.
+
+A client MAY send limit, a whole number, to cap how many categories come back.
+Without it the server returns every match, so a client can cache the full list.
+
+Person tags (see below) are not categories in this list: q=contact lists people.
```

Example:

```
GET /micropub?q=category&filter=%23micro&limit=5

{ "categories": ["micropub", "microformats"] }
```

### Contacts

```diff
 q=contact&filter=aaron would do a search for any field which matches .*aaron.*
+
+A server SHOULD accept search as the same parameter as filter, since existing
+clients and servers use both. Matching SHOULD ignore case, accents and a leading @.
+Contacts where a word of the name or a handle starts with the text SHOULD come
+before those that only contain it. limit works as for q=category.
+
+A contact MAY include silos, an object keyed by network name, whose values are the
+person's handle on that network:
+
+  { "name": "Aaron Parecki", "nickname": "aaronpk@aaronparecki.com",
+    "url": "https://aaronparecki.com/@aaronpk",
+    "silos": { "mastodon": "aaronpk@aaronparecki.com", "bluesky": "aaronpk.bsky.social" } }
+
+A server that knows one person by several accounts SHOULD return one contact
+with each handle in silos, so a client can mention them correctly on each
+network it syndicates to.
```

On this site, contacts come from the accounts Casey follows (`src/lib/data/social-follows.json`, refreshed by a workflow). Accounts with the same display name become one contact. `url` is the Mastodon profile when there is one, otherwise the Bluesky profile, and `nickname` is that account's handle.

### Query for supported queries (issue #7)

```diff
+The configuration response MAY include q, a list of every value of q the
+server answers. A client SHOULD check it before offering autocomplete from
+q=category or q=contact.
```

This site returns `"q": ["config", "source", "syndicate-to", "channels", "category", "contact"]`.

### Person tags in category

```diff
+A value of category MAY be an h-card, or the URL of a person's profile, to tag that
+person. A server that stores person tags SHOULD keep the h-card's name, url and photo,
+and MAY drop other properties. It SHOULD reject an h-card without an http or https url.
+
+  "category": ["indieweb", { "type": ["h-card"], "properties": {
+    "name": ["Aaron Parecki"], "url": ["https://aaronparecki.com/"] } }]
+
+When it publishes the post, the server SHOULD mark each person tag up as
+u-category h-card, and SHOULD leave person tags out of its tag pages, tag
+feeds and q=category.
```

The rendered markup is one link per person, with the URL implied from the link:

```html
<a class="u-category h-card" href="https://aaronparecki.com/"><span class="p-name">Aaron Parecki</span></a>
```

## Compatibility

- **Old clients:** `q=category` without `filter` and `q=contact` without `search` return the full lists in the documented shape. `q` and `silos` are extra fields that clients can ignore.
- **Old servers:** a client that sees no `q` in `q=config` can still try `q=category` and fall back on a `400`.
- **Existing posts:** posts with only text categories are unchanged. On this site, a post with person tags opens in the web editor with `category` read-only, because the editor edits tags as text.

## Implementation on this site

- `src/lib/server/publishing/micropub-queries.ts`: tag ranking and case folding, contacts from followed accounts, `filter`/`search` matching.
- `src/lib/server/publishing/micropub.ts`: answers both queries, lists them under `q` in `q=config`, and keeps only name, url and photo from h-card categories.
- `src/routes/micropub/+server.ts`: tags come from the posts bundled with the deploy, read once per Worker isolate.
- `src/lib/person-tags.ts` and `src/lib/server/parse-post.ts`: split `category` into topic tags and `people`.
- `src/lib/components/posts/PersonTag.svelte`: the `u-category h-card` chip in `PostMeta`.

## Open questions

1. Should `q=category` return counts (`{ "name": "micropub", "count": 12 }`) so clients can sort or size tags themselves? That changes the documented shape, so this site keeps plain strings.
2. Should two accounts merge into one contact only when they link to each other (rel=me), rather than by display name? Matching by name is simple but could merge two different people who share a name.
3. Should `silos` be keyed by `syndicate-to` uid, so a client can pair each handle with the target it posts to? This would be the same question as the open question on `syndication-thread` limits.
