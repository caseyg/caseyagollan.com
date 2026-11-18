# Proposal: native quote posts when syndicating

Status: draft, implemented on caseyagollan.com (2026-11, PR 218). Companion to [micropub-syndication-threads.md](micropub-syndication-threads.md). It adds no new properties: it says how a server should syndicate posts that already use `repost-of` or `quotation-of`.

## Problem

A post that quotes a Bluesky or Mastodon post, or reposts it with a comment, usually reaches those networks as plain text with a link, often with a line like "Reposted https://bsky.app/…" or "Quoting @someone’s post". On the quoted post's own network, readers expect a native quote: the quoted post appears as a card, its author is notified, and it counts as a quote there. Both networks now have quotes: Bluesky's `app.bsky.embed.record`, and Mastodon's `quoted_status_id` since 4.5 (API version 7).

## Summary

| Post | Quote target | Sent as |
|---|---|---|
| `repost-of` with `content` | first `repost-of` URL that is a social post | native quote on that network |
| any post with `quotation-of` | first `quotation-of` URL that is a social post | native quote on that network |
| `repost-of` without `content` | none | unchanged (not a quote) |

## Changes to the Micropub spec

Diffs are against the [Micropub living standard](https://micropub.spec.indieweb.org/) text kept in `../specs/core/micropub-living.txt`.

```diff
+3.3.8 Syndicating quotes (extension)
+
+When a server syndicates a post (for example because of mp-syndicate-to) that has a
+quotation-of value, or a repost-of value together with content, and that URL names a
+post on the network being sent to, the server SHOULD send the first post of the social
+copy as a native quote of it, rather than as text with a link:
+
+  Bluesky:  an app.bsky.embed.record embed with the quoted post's uri and cid
+            (app.bsky.embed.recordWithMedia when the post also carries photos).
+  Mastodon: the quoted status's local id in quoted_status_id, found by searching
+            for its URL with resolve=true.
+
+On that network, the server SHOULD leave out of the generated text the line that only
+names the quoted post ("Reposted …", "Quoting …"), since the quote shows it. Other
+networks get the text as before.
+
+When a quote can't be attached, because the quoted post is gone, its author turned
+off quotes (Bluesky postgate, embeddingDisabled), or the Mastodon quote policy says
+denied, the server SHOULD still send the post, and SHOULD add the quoted post's URL
+to the text when it is missing and fits.
+
+A server MUST NOT send a quote for a repost-of without content: that is a repost,
+not a quote.
+
+Only the first post of a syndication thread (3.3.7) quotes; later posts are replies.
```

Example: a repost with a comment, sent to both networks.

```
h=entry
&repost-of=https://bsky.app/profile/ntnsndr.in/post/3n24vbfmows2q
&content=Worth reading.
&mp-syndicate-to=https://caseyagollan.com/syndication/bluesky
&mp-syndicate-to=https://caseyagollan.com/syndication/mastodon
```

Bluesky gets a quote of that post, with the text `Worth reading.` and a link back. Mastodon can't quote a Bluesky post, so it gets `Worth reading. Reposted https://bsky.app/…` and a link back.

## Compatibility

- **Clients:** nothing changes for them. A client that sends `quotation-of` or `repost-of` with content gets native quotes from a server that supports this. This site checks that `quotation-of` values are URLs, as it already did for `repost-of`.
- **Old servers:** they keep sending text and a link.
- **Backfeed and PESOS:** a quote this site sent is one of the post's `syndication` links, so it is never imported as a new post.

## Implementation on this site

- `src/lib/server/publishing/syndication-quotes.ts`: which network can quote a URL, Bluesky and Mastodon lookups, and the fallback link.
- `src/lib/server/publishing/publication.ts`: `quote` on the publication, with the text the quote card replaces left out.
- `src/lib/server/publishing/syndication.ts`: attaches the quote to the first post.
- The composer offers syndication for a repost once it has a comment, and the syndicate page shows the quoted post (`QuotedPost`).

## Open questions

1. Should `q=config` advertise which networks quote natively, so a client can show the quote card before posting? For example `"syndication-quotes": ["bluesky", "mastodon"]`.
2. Should a repost without content become a native repost (Bluesky `app.bsky.feed.repost`, Mastodon reblog)? Neither has a public URL that fits in `syndication`, so this proposal leaves plain reposts alone.
3. A Mastodon server can only quote a status it can find. The token needs `read:search`.
