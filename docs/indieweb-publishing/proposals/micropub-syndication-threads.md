# Proposal: syndication threads in Micropub

Status: draft, implemented on caseyagollan.com (2026-11). Written as an extension proposal for the [Micropub extensions](https://indieweb.org/Micropub-extensions) list, in the style of `post-types` and `syndicate-to` additions.

## Problem

A long post often goes to Bluesky or Mastodon as a thread: several short posts, each a reply to the one before. Micropub has one way to ask for a social copy, `mp-syndicate-to`, which names *where* to send but not *what* to send. Today a server either cuts the text down to one post or invents its own split, and a client can't show, edit or store the thread the person wrote. When the site later imports its own social posts (PESOS, backfeed), the extra posts of the thread look like new notes.

## Summary

| Piece | Name | Where |
|---|---|---|
| The thread's text, one value per post, in order | `syndication-thread` | post property |
| Which post each photo goes on, parallel to `photo` | `syndication-photo-post` | post property |
| The server stores threads, and the limits to split by | `syndication-thread` | `q=config` |
| Every post of a sent thread, first post first | `syndication` | post property (existing) |

Neither property starts with `mp-`: they describe the post's content and are stored with it, so `q=source` returns them and clients can edit them later with `replace`. Servers that don't support the extension keep or ignore them under §3.3.5, and still syndicate the post the way they do today.

## Changes to the Micropub spec

Diffs are against the [Micropub living standard](https://micropub.spec.indieweb.org/) text kept in `../specs/core/micropub-living.txt`.

### §3.3 Create: new properties

```diff
 3.3.5 Unrecognized Properties

 If the request includes properties that the server does not recognize, it MUST
           ignore unrecognized properties and create the post with the values that are recognized.
+
+3.3.7 Syndication Threads (extension)
+
+A client MAY include the text of the social copy as a thread, in a property called
+syndication-thread. Each value is the plain text of one post, in order. When the
+server syndicates the post (for example because of mp-syndicate-to), it SHOULD send
+the first value as a new post and each later value as a reply to the value before it,
+instead of text it would generate from the post.
+
+syndication-thread[]=Part one of a long post…&syndication-thread[]=…and part two. https://example.com/2026/11/17/post/
+
+A server MUST reject a syndication-thread whose values are not strings, are empty,
+or are more than the max-posts it advertises (see 3.7.1). It SHOULD NOT reject a value
+for being longer than one network's limit when the post is stored: the limit is checked
+when that network is sent to, since a thread may go to networks with different limits.
+
+A client MAY include syndication-photo-post, with one value per value of photo, in the
+same order. Each value is the number of the thread post that photo goes on, counting
+from 0. A missing value means the first post, and a number past the last post means
+the last post; a server with no thread sends every photo with the first post. A server
+MUST reject values that are not whole numbers from 0 to max-posts minus 1.
+
+A server SHOULD NOT treat a change to syndication-thread or syndication-photo-post as a
+change to the post's content: editing the thread of a post that was already syndicated
+does not send it again.
```

### §3.4 Update: nothing new

`replace`, `add` and `delete` work on both properties as on any other. Replacing `syndication-thread` with one value, or deleting it, turns the social copy back into a single post.

```diff
 3.4.1 Replace
 …
+Example: changing the syndication thread
+
+{
+  "action": "update",
+  "url": "https://example.com/2026/11/17/post/",
+  "replace": {
+    "syndication-thread": ["First post, edited", "Second post", "Third post"],
+    "syndication-photo-post": [0, 2]
+  }
+}
```

### §3.7.1 Configuration: advertising the extension

```diff
 The server SHOULD include the following information in the configuration response.

 The list of syndication endpoints supported, in a property called syndicate-to

 The Media Endpoint if supported, in a property called media-endpoint
+
+If the server sends syndication threads, an object in a property called
+syndication-thread, with:
+  property:             the post property that holds the thread (syndication-thread)
+  photo-property:       the post property that places photos (syndication-photo-post)
+  max-posts:            the most posts a thread can have
+  max-photos-per-post:  the most photos one post of the thread can carry
+  limits:               per network, characters per post, and how links are counted
+                        ("actual", or a fixed number of characters per link)
+
+A client SHOULD NOT send syndication-thread unless the server advertises it, and
+SHOULD use limits to split text and show counts as the networks will count them.
```

Example response from this site:

```json
{
  "syndicate-to": [
    { "uid": "https://caseyagollan.com/syndication/bluesky", "name": "Bluesky" },
    { "uid": "https://caseyagollan.com/syndication/mastodon", "name": "Mastodon" }
  ],
  "syndication-thread": {
    "property": "syndication-thread",
    "photo-property": "syndication-photo-post",
    "max-posts": 20,
    "max-photos-per-post": 4,
    "limits": {
      "bluesky": { "characters": 300, "link-length": "actual" },
      "mastodon": { "characters": 500, "link-length": 23 }
    }
  }
}
```

`limits` is keyed by network name for now. A future version could key it by `syndicate-to` uid instead, so it works for any target.

### §3.7.2 Source content: the sent thread

```diff
+After a thread is sent, the server SHOULD add the URL of every post of the thread to
+the post's syndication property, first post first, so q=source and the post's
+u-syndication links name the whole thread. Consumers that show one link per network
+SHOULD use the first.
```

## Backfeed and PESOS

A server that imports its own social posts SHOULD treat a social post as already on the site when its URL is any value of a post's `syndication`, including the later posts of a thread. Until the links are saved, this site also checks its private send records, which list every post of a thread as it goes out, so nothing is imported between the send and the commit that records it.

## Compatibility

- **Old clients:** they never send the properties, and posts syndicate as before.
- **Old servers:** they ignore or store the properties (§3.3.5) and send their usual single post.
- **Shared editing:** the site's own syndicate page reads and writes the same two properties ("Save thread"), so a thread started in an iOS client can be finished on the web, and the reverse.

## Implementation on this site

- `src/lib/server/publishing/syndication-thread.ts`: property names, validation, `q=config` entry.
- `src/lib/server/publishing/micropub.ts`: validates the properties on create and update, and advertises them in `q=config`.
- `src/lib/server/publishing/syndication.ts`: sends a thread as a reply chain (Bluesky `reply.root`/`reply.parent`, Mastodon `in_reply_to_id`), resuming after the last sent post.
- `src/lib/server/publishing/delivery.ts`: automatic sends use the stored thread and photo placement, and save every post's URL to `syndication`.
- `src/lib/server/publishing/pesos/importer.ts`: skips every post of a syndicated thread.

## Open questions

1. Should the thread be allowed to differ per network (for example a shorter Bluesky split)? One shared thread keeps clients simple; per-network threads could use `syndication-thread` keyed by uid in the JSON syntax.
2. Should a server add numbering (“1/3”) itself, or leave that to the text the client writes? This proposal leaves it to the text.
3. Is `syndication-photo-post` better as a nested property on each photo object (`{ "value": "…", "alt": "…", "post": 1 }`)? That reads better in JSON, but form-encoded clients can't send it.
