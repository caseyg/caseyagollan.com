# Proposal: Micropub over MCP

Status: experimental, implemented on caseyagollan.com (2026-11, `/chat` draft PR). Not a change to Micropub itself: a mapping from Micropub requests to [Model Context Protocol](https://modelcontextprotocol.io/) tools, so AI agents can use a Micropub endpoint with the same token and scopes as any other client.

## Problem

AI assistants increasingly reach outside services through MCP servers. An agent that should post to, or read from, a personal site has two poor choices today: be taught the Micropub vocabulary in a prompt and build requests by hand, or use a site-specific API. Neither reuses what Micropub already settled: Microformats2 properties, `q=config` / `q=source`, IndieAuth tokens and their scopes.

## Summary

An MCP server in front of a Micropub endpoint that:

- exposes a small, fixed set of tools, each one Micropub request;
- authenticates with the caller's IndieAuth access token, passed through to the Micropub endpoint untouched, so the endpoint checks scopes exactly as it would for any client;
- adds no state of its own.

| Tool | Micropub request | Scope the endpoint requires |
|---|---|---|
| `micropub_config` | `GET ?q=config` | any valid token |
| `micropub_list_posts` | `GET ?q=source&limit=…&post-type=…&after=…` (post-list extension) | `update` |
| `micropub_get_post` | `GET ?q=source&url=…` | `update` |
| `micropub_create_post` | `POST` JSON `{type: ["h-entry"], properties}` | `create`, or `draft` for drafts |
| `micropub_update_post` | `POST` JSON `{action: "update", url, replace, add, delete}` | `update` |

Delete and undelete are left out on purpose: an agent reading untrusted pages shouldn't hold a tool that removes posts.

### Defaults chosen for agents

- `micropub_create_post` sends `post-status: draft` unless the caller passes `post_status: "published"`. The tool description tells the model to publish only when the person explicitly asks.
- `content` is a plain string (Markdown on this site), not an HTML object.
- `in_reply_to`, `like_of`, `repost_of` and `bookmark_of` map to the hyphenated Micropub properties.
- Results are the Micropub response as text: the `Location` header for creates, the JSON body for queries, and `error: error_description` with `isError: true` when the endpoint refuses.

## Transport

- `POST /micropub/mcp` with one JSON-RPC message (or a batch), `Authorization: Bearer <IndieAuth token>`, `Content-Type: application/json`. Answers are JSON (Streamable HTTP without SSE). Notifications get `202 Accepted`. No session id is issued.
- Without a Bearer token the server answers `401` with `WWW-Authenticate: Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/micropub/mcp"` (see Signing in from an MCP client).
- Methods: `initialize` (protocol version `2025-06-18`), `ping`, `tools/list`, `tools/call`.

## Signing in from an MCP client

Added 2026-11-27, so that an MCP client such as Claude can be pointed at the server's address and sign in by itself, with no pasted token. MCP's authorization is OAuth 2.1 with discovery; an IndieAuth server is nearly that already. What it took:

- **Protected resource metadata** (RFC 9728) at `/.well-known/oauth-protected-resource/<path of the MCP server>`: `resource` (the server's exact URL), `authorization_servers` (the IndieAuth issuer), `scopes_supported`, `bearer_methods_supported: ["header"]`. The `401` names it in `WWW-Authenticate`.
- **Client ID Metadata Documents.** IndieAuth clients are already identified by a URL, and this server already accepted a JSON document there (`client_id`, `client_name`, `redirect_uris`). Authorization server metadata now says so with `client_id_metadata_document_supported: true`, which is what MCP clients look for before they fall back to dynamic client registration (which this server does not offer). `token_endpoint_auth_methods_supported` stays `["none"]`.
- **Refresh tokens.** A code exchanged at the token endpoint now also returns a `refresh_token` (IndieAuth allows it). `grant_type=refresh_token` returns a new access token and a new refresh token and ends the old pair; a refresh token works once and lasts 90 days unused. Revoking the access token (RFC 7009, or from the owner's token list) ends its refresh token, and the reverse. Personal tokens made on the account page have none. `grant_types_supported` lists `refresh_token`.
- **Scopes.** The owner still ticks which scopes to grant on the consent page. A client that names an MCP server in the `resource` parameter (RFC 8707) and asks for no scopes is offered that server's `scopes_supported`. Tokens are not bound to one resource: both MCP servers and Micropub belong to the same owner and check scopes themselves.

An IndieAuth server that does these three things can be signed in to by a generic MCP client. Nothing changes for existing IndieAuth clients except that they are handed a refresh token they may ignore.

## The whole site as an MCP server

`/mcp` (2026-11-27) is a second server on the same transport, for the site rather than for Micropub: search, reading pages, the owner's saves and tables, and the four posting tools as the chat has them (the one-line-per-post list, one post's Markdown source, create, update). Its tools are the chat's own registrations, not copies. It needs a token with `read`; posting tools call Micropub with the caller's own token, so `create`, `draft` and `update` decide what a client may write, as for any Micropub client. `/micropub/mcp` stays as specified above for clients that want Micropub alone.

### A view of the site inside the client (MCP Apps)

Some MCP clients draw a page a server provides beside a tool's result (the MCP Apps extension, `io.modelcontextprotocol/ui`). This site uses it for tables, its canvases of posts and notes: `table_open` names a `ui://` resource, and the client shows the table as a live canvas the person can use while the other `table_*` tools change it.

What generalizes to any personal site:

- **The view has no session.** It runs in the client's sandbox at an address that isn't the site's, without cookies. Everything it does goes through tool calls its host relays with the same token the connection was approved with: load, save, and a long poll for the next change. Those tools are marked `visibility: ["app"]`, so a model is never offered them.
- **The page is a shell.** The resource is a few lines of HTML that load a script from the site, so the site's own components draw the view and a deploy updates it. The resource names every host it loads from (`_meta.ui.csp`), and the site lets other origins read only what is public anyway (the script, the search index, public posts' sources).
- **One live view per thing.** Opening the same table again replaces the earlier view, which is told to stop saving, so two canvases never write over each other.
- **Scopes still decide.** Reading a table needs `read`; changing one needs `update` and making one `create`, the scopes Micropub already defines. A connection without them gets a canvas to look at.
- **Links out carry a pass.** The browser inside an MCP client often can't use the owner's passkey, so a link the server gives to something private (a draft table) carries a short-lived pass to that one thing. The browser that opens it trades the pass for a cookie scoped to that thing, with no more permission than the connection had. Only hashes of passes are stored.
- **Clients that draw nothing lose nothing.** Tools that need the view are left out for a client that didn't declare the extension, so it never sees a tool it can't use.

## In-process use

The site's `/chat` agent uses the same server in process, through a small MCP client that sends the same JSON-RPC messages. It is offered only when every message the agent is answering came from the site owner's own passkey session; the Worker checks that on each turn. The agent then holds a single-use token accepted only by that call's Micropub handler (`ownerMicropub`), with `create update draft` scopes.

What that use taught about the tool shapes (2026-11-25): an agent with a small context cannot take `micropub_list_posts` as specified above. Twenty posts' full sources ran to 30,000 characters a call, and a question as plain as "what's new this week?" spent several such calls. The chat now keeps `micropub_create_post` and `micropub_update_post` from this server unchanged, and for reading asks Micropub itself with two requests any client could make:

- A list of one line per post: `GET ?q=source&limit=…&properties[]=name&properties[]=content&properties[]=published&properties[]=post-status&…`, each item cut down to its URL, status, type, date and opening words. An option for drafts only looks through two pages of 100 before answering, and says how far back it looked.
- One post's source for editing: `GET ?q=source&url=…&p3k-content-type=text/markdown`, without the site's own bookkeeping properties.

It leaves out `micropub_config`. The server at `/micropub/mcp` is unchanged; a `summary` option on `micropub_list_posts` doing the same would be the natural addition for other agents.

## Open questions

- Should `q=config` advertise the MCP endpoint (for example `"mcp": "https://example.com/micropub/mcp"`) so MCP-capable clients can find it from the Micropub endpoint?
- Tokens are not audience-bound. Should a token issued for `resource=…/mcp` be refused at `/micropub`, or is one owner's scopes enough?
- A media tool (`micropub_upload`) needs a way to pass files that MCP doesn't settle yet.
- Should `micropub_list_posts` return summaries by default, with full sources on request? Agents rarely want twenty posts' sources, and their context is the scarce thing.

Code: `src/lib/server/chat/micropub-mcp.ts`, route `src/routes/micropub/mcp/+server.ts`, tests in `tests/chat.test.ts`. The site server: `src/lib/server/mcp/server.ts` and `site.ts`, routes `src/routes/mcp/+server.ts` and `src/routes/.well-known/oauth-protected-resource/`, tests in `tests/site-mcp.test.ts`; refresh tokens in `src/lib/server/indieauth/state.ts`.
