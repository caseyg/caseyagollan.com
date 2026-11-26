# tldraw's MCP server, and what the table chat takes from it

Looked at on 2026-11-26: `https://mcp.tldraw.com/mcp` (landing page `https://mcp.tldraw.com/`), as a connected client.

## What tldraw ships

- **Sign-in**: OAuth through Clerk (`/.well-known/oauth-protected-resource/mcp`); an unauthenticated `initialize` answers 401. A file must be open in the person's browser for the server to reach it.
- **Two tools**, whatever the landing page's list of abilities suggests:
  - `search { code }`: JavaScript that receives a `spec` object and returns part of it. The spec is about 197,000 characters: 333 Editor members in 21 categories (name, signature, description, examples), shape definitions, and 12 helpers. None of it is in the prompt; the model queries it.
  - `exec { code, canvasId? }`: JavaScript run in the canvas widget with the live `editor` in scope, plus helpers (`createArrowBetweenShapes`, `boxShapes`, `fitFrameToContent`, `Box`, `Vec`). Its description carries seven worked one-line examples.
- **Server instructions**, in full: use `search` to query the spec, `exec` to run code, and "the current canvas state is kept in model context as raw TLShape, asset, and binding data."
- **A simplified shape format** over tldraw's own: `{ _type: 'rectangle', shapeId: 'box1', x, y, w, h, text, color, fill, note }`, arrows with `fromId`/`toId`. Ids are chosen by the model, so one script can make shapes and join them. Every shape has a `note` field: words for the model that are not drawn.
- **The widget does the work.** In a client that doesn't draw the widget, `exec` answers only `{"canvasId": "…"}`: nothing the code returned comes back.

## How ours differs

| | tldraw MCP | Table chat |
| --- | --- | --- |
| Tools | 2 (`search`, `exec`) | 12 `table_*` tools, one per intent |
| Where knowledge of the API lives | A searchable spec, outside the prompt | Tool schemas and a prompt section, capped at 25,000 characters by a test |
| Canvas state | Always in context, raw | Was: `table_read` when needed. Now: listed in the prompt at every step |
| Layout | The model writes coordinates and loops | `table_arrange` measures and lays out; the model never works out positions |
| Runs | Arbitrary JavaScript in a sandboxed widget | Typed operations checked by the server, done by Casey's page |
| Who | The signed-in tldraw account | Casey only (`TABLE_OWNER_TOOLS`); reads are open |

## What was tried (utils/chat-eval, glm-flash-green, 14 table scenarios × 3)

| | All checks pass | Tool calls | `table_read` calls | Tool errors | Tokens in | Seconds |
| --- | --- | --- | --- | --- | --- | --- |
| Before | 38 of 42 | 3.17 | 22 | 1 | 31,300 | 5.2 |
| Table listed in the prompt at every step | 41 of 42 | 2.31 | 3 | 3 | 26,300 | 4.9 |
| Code mode: `table_run` + `table_help` replace the table tools | 7 of 42 | 3.24 | 0 | 12 | 23,600 | 5.8 |

- **State in context** is the clear win, and is what this change ships (`tableListing` in `src/lib/table-agent.ts`, the `table-now` prompt section in `src/lib/server/chat/tools.ts`). A first try put the listing in the message itself: the model then took "these" to mean everything listed instead of Casey's selection (0 of 3 on `selection-act`), and summarized from clipped words. Listing it as a prompt section, marking selected items, and saying the words are clipped fixed both.
- **Code mode** lost with this model. About half of its failed checks are checks that look for a tool by name and can't see calls made inside the code; the real signal is twelve times the tool errors (guessed argument names, `{source, in}` used for single blocks, variables used as ids) and more rounds, because the schemas are a `table_help` call away. `CHAT_EVAL_VARIANT=code bun utils/chat-eval/run.ts` reruns it.

## Recommendations

1. **Keep discrete tools for the table.** Our one-call-per-intent tools with server-side layout beat scripts for a small, cheap model. tldraw's design assumes a frontier model that writes correct code against a large API.
2. **If a code tool comes (pi codemode, in the saves thread), give it the table tools as typed bindings, in the sandbox Worker**, never model-written JavaScript in Casey's signed-in page. tldraw can run code beside the editor because its widget is a sandboxed frame; our table page holds Casey's session, and the chat reads untrusted pages. Typed ops are the safety boundary: keep them.
3. **Worth taking later**, each small:
   - Model-chosen handles in `table_add` (`as: "a"`), so one call adds notes and `links` between them. Would cut `table-fill` and `table-illustrate` by a round.
   - A hidden `memo` on items (tldraw's `note`): why the assistant put something there, kept in shape `meta`, shown in the listing.
   - `table_help`-style lookup for rare options (pen strokes, arrow styles, cluster details), to buy room under the 25,000-character cap as tools grow.
   - One worked example in each of the three most-used tool descriptions, as tldraw does in `exec`.
4. **Not worth taking**: raw `TLShape` records in context (ours are a line each, which is all the model needs to act), and exec in the page.
