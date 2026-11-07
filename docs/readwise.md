# Readwise bookmark review

`/readwise` requires the existing owner passkey session. Sign in at `/account`.
Configure `READWISE_ACCESS_TOKEN` as a server-side Worker secret; a local `.env`
value alone does not configure production. Existing internal IndieAuth and
Micropub/GitHub publishing bindings must also be configured.

The queue uses Readwise Reader's document LIST API (`/api/v3/list/`), with cursor
pagination. It shows source URL, title, author, summary, category, and saved date;
notes, highlights, and child documents are excluded. Days use the publishing
timezone (America/New_York by default). Items start unchecked, including when
loading more pages. Day selection applies to the items loaded so far.

Preview reads do not write to GitHub, browser storage, or a server cache. Responses
are private/no-store and noindex. External preview images are deliberately not
loaded, so reviewing the queue does not contact source websites.

Only **Import selected** publishes posts, through the existing Micropub handler.
The public fields are the approved title, source URL, and saved timestamp. Personal
notes, summaries, tags, and Readwise content are never included. No automatic
syndication is requested. The UI sends explicit selections in chunks of ten.

`integrations/readwise.json` in the configured GitHub content repository stores
only two sorted, deduplicated arrays of IDs: `dismissed` and `imported`. Fetching a
queue page reads this single file and filters both arrays before returning the
previews. Dismissals, including day/batch dismissals, write IDs only. GitHub SHA
conflicts re-read and merge the arrays, retaining concurrent changes. Read failures
fail closed rather than treating the ledger as empty.

Posts use a deterministic `readwise-ID` slug and saved date. If publishing succeeds
but the response or ledger update fails, retrying checks the existing bookmark
before completing the ledger. Partial failures preserve remaining selections.
There is no scheduled Readwise import and no import-on-fetch behavior.

This integration reviews saved Reader documents, not the separate Readwise v2
highlight export. Source documents without an HTTP(S) source URL are excluded.
