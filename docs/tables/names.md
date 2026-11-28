# Names for untitled tables

A table starts as "Untitled table". Once it has words on it and has been left, the site names it
from what is on it, with the chat's fast model (the one voice notes use: Qwen on Cerebras, falling
back to the chat's own). A name Casey typed is never changed: only a table still called
"Untitled table" is named, and it is named once.

## When

Naming on exit alone would miss a closed tab, a phone that sleeps, and tables made from the chat or
the Claude connector. So there are two triggers, both on the server's side of the work:

1. **Leaving the table's page.** The browser saves what is waiting and then asks
   `POST /api/tables/<id>/name` (a `keepalive` request, so it outlives the page). The list of tables
   waits for that answer, so the new name is there when Casey gets back to `/tables`.
2. **The Worker's pass, every five minutes** (`nameIdleTables` in `worker.mjs`'s `scheduled`). It
   names untitled tables changed in the last three hours that have sat still for five minutes. This
   catches everything the first trigger misses.

The pass leaves older untitled tables alone. To name those, press ⌘K on `/tables` and choose
**Name untitled tables** (`POST /api/tables/names`, a few tables per call until none are left).

## Rules

- `src/lib/table-names.ts`: what counts as untitled, what the model is shown (areas' names first,
  then blocks, notes and text in reading order), the prompt, and reading a name out of the answer.
- `src/lib/server/table-names.ts`: asking the model, the pass, and the backlog.
- A name is saved with a conditional write (`renameUntitled` in `src/lib/server/tables.ts`): if the
  canvas or the name was saved while the model thought, that save wins and the name is tried on it.
  Naming doesn't change when the table was last changed, so the list keeps its order.
- Tables with nothing to name them by are remembered in `tables/names-tried.json` and not read
  again until they change.
- Only the signed-in owner can ask for names; the demo (`?owner=demo`) keeps tables in the browser
  and doesn't name them.
