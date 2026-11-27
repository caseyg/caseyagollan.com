# Maps of saves (`table_map`)

“Make a canvas with everything I saved to Readwise this week” is one tool call in the chat. This
note records where the design came from, what each stage does, and what was left out.

## Where it came from

Casey asked the same thing of a whiteboard with its own layout engine and got a better map than
anything the chat's table tools had made: clusters were visible, lines meant something, and the
quotes were worth reading. The table tools already had richer cards. What they lacked was a
pipeline: the model was fetching, choosing, placing and connecting by hand, one tool call at a
time, and running out of steps. The lessons carried over:

| Lesson | Here |
| --- | --- |
| Cache the export and ask only for deltas | The `docs` stage keeps its file; Reader is asked for `updatedAfter` the last run. |
| Each stage a script, JSON between | Five stages, one file each under `private/chat/maps/<key>/`, each signed by its input. `redo` re-runs chosen stages. |
| Lay out on the server, deterministically | `graphLayout` in `src/lib/table-graph.ts`: seeded, so the same input lands in the same place. |
| Real links are the backbone, likeness is decoration | Two tiers of ties, drawn differently: solid white for a link or shared citation, dotted grey for likeness. |
| Quotes need a strict filter, a model's pick, and a substring check | `quotes.ts`. A highlight always wins. |
| Pictures are flaky; plan a placeholder; mirror to your own storage | `images.ts`. The placeholder is a title tile in the site's blue. |
| Decide a policy on photos of people | A vision check; a picture is served only once cleared. Failing closed, to the tile. |
| Non-English text skews TF-IDF | Likeness is only measured between documents in one language. |
| Near-duplicates (the talk and its write-up) | Tied as “same story”, by title or by near-identical vocabulary. |

## Stages

1. **docs** (`docs.ts`). Each source's saves as `MapDoc`s: text, outgoing links, candidate
   pictures, highlights. Readwise comes from Reader's list API with HTML; Are.na and Raindrop
   through `saves.ts`; the site's posts from its search index. A document with little text has its
   page read once (60 a run; the rest wait for the next run). 150 documents a map.
2. **links** (`edges.ts`). Strong: one saved page links to another; two or three cite the same
   page elsewhere (share buttons, profiles, a site's own menus and anything cited by a crowd are
   not citations); the same story twice. Weak: each document's nearest few by TF-IDF cosine, kept
   when mutual or either's very nearest; a light chain through one publisher; one loose tie for
   anything that would otherwise stand alone.
3. **quotes** (`quotes.ts`). Casey's highlight if there is one. Otherwise up to six candidate
   sentences that pass the rules (length, shape, no credits, captions, sign-ups or biography), one
   model call per 24 documents to choose, and a check that the choice is in the text word for
   word. Garbled transcripts get no quote.
4. **images** (`images.ts`). The first candidate that fetches and is cleared, shrunk to 560×280 and kept in R2.
   One vision call per batch asks whether each shows a recognizable person; those are left out.
   A picture nobody could check is not shown, and is tried again next run.
5. **graph** (`graph.ts`). Blocks with their measured boxes, then the layout: charge scaled by
   degree so hubs open into rings, short reach so clusters don't push each other away, gravity so
   nothing drifts, collision late so the forces settle first, twelve seeds scored by crossings,
   lines through cards, line length and shape, then overlap removal.

## Sources

`sources` takes any mix of `readwise`, `arena`, `raindrop` and `site`, each optionally with a
place (`in`), words (`query`) and its own window (`days`, 0 for the whole place), so “this week's
saves plus the whole of that channel” is one map. A source that can't be reached is named in the
result and the others still make their map. Are.na blocks and the site's posts keep the cards the
tables already draw for them; everything else is a `SourceCard`.

## Left out, on purpose

- Embeddings for likeness. TF-IDF is enough for a week of saves and needs no index; the cached
  connector store being built separately has vectors, and the `docs` stage should read from it
  once both have landed.
- Edge routing. Lines are straight; the layout is scored to keep them clear of cards instead.
- A toolbar button for people. The pipeline is server-side and pure, so one could call it.
