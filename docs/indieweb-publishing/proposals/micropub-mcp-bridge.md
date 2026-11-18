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
- Without a Bearer token the server answers `401` with `WWW-Authenticate: Bearer`.
- Methods: `initialize` (protocol version `2025-06-18`), `ping`, `tools/list`, `tools/call`.

## In-process use

The site's `/chat` agent uses the same server in process, through a small MCP client that sends the same JSON-RPC messages. It is offered only when every message the agent is answering came from the site owner's own passkey session; the Worker checks that on each turn. The agent then holds a single-use token accepted only by that call's Micropub handler (`ownerMicropub`), with `create update draft` scopes.

## Open questions

- Should `q=config` advertise the MCP endpoint (for example `"mcp": "https://example.com/micropub/mcp"`) so MCP-capable clients can find it from the Micropub endpoint?
- MCP's own authorization spec is OAuth 2.1 with protected-resource metadata. An IndieAuth server is already OAuth 2.0 with PKCE; publishing `/.well-known/oauth-protected-resource` for `/micropub/mcp` would let generic MCP clients sign in without a pasted token.
- A media tool (`micropub_upload`) needs a way to pass files that MCP doesn't settle yet.

Code: `src/lib/server/chat/micropub-mcp.ts`, route `src/routes/micropub/mcp/+server.ts`, tests in `tests/chat.test.ts`.
