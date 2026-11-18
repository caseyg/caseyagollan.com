# Proposal: every IndieWeb post type in Micropub

Status: draft, implemented on caseyagollan.com (2026-11). It documents the vocabulary this endpoint accepts for each type on the IndieWeb [posts](https://indieweb.org/posts) page, and the `q=config` shape that advertises it. Most of it follows existing practice. The parts that go beyond the spec or the wiki are marked **extension**, so they can be proposed on the [Micropub extensions](https://indieweb.org/Micropub-extensions) page.

## Problem

Micropub defines how to create a post, but not which properties make a read, a checkin or a recipe. Clients and servers each pick names from the wiki, and a server has no standard way to say which types it takes or what each one needs. A client like Quill hardcodes a menu, so it can't tell that a server accepts recipes or refuses weight posts.

## Summary

| Type | Root | Key property | Value | Folder |
|---|---|---|---|---|
| Note | h-entry | `content` | text | `notes` |
| Article | h-entry | `name` + `content` | text | `articles` |
| Reply | h-entry | `in-reply-to` | URL | `replies` |
| Issue | h-entry | `in-reply-to` + `name` | repository URL | `issues` |
| RSVP | h-entry | `rsvp` + `in-reply-to` | yes, no, maybe, interested | `rsvps` |
| Bookmark | h-entry | `bookmark-of` | URL | `bookmarks` |
| Like | h-entry | `like-of` | URL | `likes` |
| Repost | h-entry | `repost-of` | URL | `reposts` |
| Quotation | h-entry | `quotation-of` | URL or h-cite | `quotations` |
| Collection | h-entry | `children` **extension** | URLs or h-cites | `collections` |
| Photo, video, audio | h-entry | `photo`, `video`, `audio` | URL or `{value, alt}` | `photos`, `videos`, `audio` |
| Checkin | h-entry | `checkin` | h-card | `checkins` |
| Venue | h-card | `name` | text | `venues` |
| Event | h-event | `name` + `start` | text, date | `events` |
| Itinerary | h-entry | `itinerary` | h-leg | `itineraries` |
| Review | h-review | `item` | h-product | `reviews` |
| Ate, drank | h-entry | `ate`, `drank` | h-food | `foods`, `drinks` |
| Read | h-entry | `read-of` + `read-status` | URL or h-cite | `reads` |
| Watch | h-entry | `watch-of` | URL or h-cite | `watches` |
| Listen | h-entry | `listen-of` | URL or h-cite | `listens` |
| Play | h-entry | `play-of` | URL or h-cite | `plays` |
| Jam | h-entry | `jam-of` | URL or h-cite | `jams` |
| Exercise | h-entry | `exercise` **extension** | h-exercise | `exercises` |
| Recipe | h-recipe | `name` + `ingredient` | text | `recipes` |

Weight posts are refused on purpose: every post on this site is public, and a weight log is health data.

When a post has several of these, the server files it by the first match in this order: root type, RSVP, issue, checkin, like, repost, quotation, reply, bookmark, read, watch, listen, play, jam, exercise, collection, itinerary, ate, drank, video, audio, photo, article, note. That is [Post Type Discovery](https://www.w3.org/TR/post-type-discovery/), extended with the newer types.

## Changes to the Micropub spec

Diffs are against the [Micropub living standard](https://micropub.spec.indieweb.org/) text kept in `../specs/core/micropub-living.txt`.

### §3.3 Create: vocabularies for each type

```diff
 3.3.5 Unrecognized Properties
 ...
+3.3.8 Post Type Vocabularies (extension)
+
+A citation property names a thing the post is about: quotation-of, read-of,
+watch-of, listen-of, play-of, jam-of and children. Each value is either a URL or
+an h-cite with at least a name, url or uid. An h-cite MAY have author (text or
+h-card), content (the quoted words, for quotation-of) and published.
+
+    "read-of": [{"type": ["h-cite"], "properties": {
+      "name": ["Piranesi"], "author": ["Susanna Clarke"], "uid": ["isbn:9781635575637"]}}],
+    "read-status": ["finished"]
+
+read-status is one of to-read, reading or finished.
+
+checkin is one h-card for the place: name, and optionally url, street-address,
+locality, region, postal-code, country-name, latitude and longitude.
+
+A venue is created with type h-card and the same properties at the top level.
+
+A collection is an h-entry with a name and up to 100 children values, each a URL
+or an h-cite.
+
+exercise is one h-exercise: activity (run, walk, ride, swim and so on, required),
+and optionally distance (text with its unit, such as "5 km") and duration (an
+ISO 8601 duration such as PT28M).
+
+A recipe is created with type h-recipe: name, one ingredient value per
+ingredient, and optionally yield, duration and content for the steps.
+
+An issue is an h-entry with in-reply-to set to the repository's URL, a name for
+the issue's title, and content. A reply with a name is filed as an issue.
+
+A server SHOULD reject a value of these properties in the wrong shape with
+invalid_request, rather than store it.
```

### §3.3.2 Uploading files: multipart creates

This is core Micropub, not an extension. The endpoint now accepts it:

```diff
 3.3.2 Uploading Files
 ...
+Files MAY be sent as photo, video or audio, with or without [] (photo[] for several).
+The server stores each file on its media endpoint's storage once the access token
+has been checked, then adds the file's URL to that property, after any URL values
+sent in the same request.
```

### §3.7 Querying: describe each post type

The `post-types` list in `q=config` follows the existing [Query for Supported Vocabulary](https://github.com/indieweb/micropub-extensions/issues/1) proposal, and adds the microformat root and the properties each type uses.

```diff
 3.7.1 Configuration
 ...
+    "post-types": [
+      {"type": "read", "name": "Read", "h": "entry",
+       "properties": ["read-of", "read-status", "content", "category"],
+       "required-properties": ["read-of"]},
+      {"type": "recipe", "name": "Recipe", "h": "recipe",
+       "properties": ["name", "ingredient", "yield", "duration", "content", "photo", "category"],
+       "required-properties": ["name", "ingredient"]}
+    ]
+
+h is the root type a client creates, without the h- prefix. properties lists the
+properties the server understands for that type, and required-properties the ones
+it needs. A type the server does not list is one it will not file separately;
+a client SHOULD NOT offer it.
```

## Rendering

Each type renders with its microformats classes, so a Webmention receiver or reader sees the same vocabulary: `p-read-of h-cite`, `p-checkin h-card`, `p-exercise h-exercise`, `p-ingredient`, `u-audio` and so on. Social copies get the same details as text, such as "Finished reading Piranesi by Susanna Clarke".

## Open questions

- `children` and `h-exercise` have no agreed vocabulary on the wiki. The names here are the ones mf2 parsers would produce for nested h-cite items and the activity-tracker posts that exist.
- Issues could also be sent to GitHub through syndication. This endpoint stores them only.
