# Real-Time Collaboration Architecture

## Document Rooms

Each document room is backed by one `DocumentSession` Durable Object. The application should derive its Durable Object ID from the document ID (for example, with `idFromName(documentId)`) so clients editing the same document reach the same object. The object accepts a WebSocket upgrade with `?documentId=<id>`, loads the document through Drizzle and D1, and sends the current content in an `open` event.

The Durable Object keeps active WebSocket references in an in-memory set and uses the hibernation-aware WebSocket API. Open connections are also recoverable through `state.getWebSockets()` after the object wakes. Message and close callbacks are handled by `webSocketMessage`, `webSocketClose`, and `webSocketError`. Every room is isolated from other rooms by its Durable Object ID.

Text edits are broadcast to every connected socket except the sender. The object applies each patch to its current in-memory content and stores a draft in Durable Object storage so an object restart before the next database save does not discard the latest patch. A Durable Object alarm runs every five seconds while the room has active sockets or unsaved changes; it writes the latest content and `updatedAt` to the D1 `documents` row with Drizzle. Successful writes are broadcast as `save` events.

The `DocumentSession` binding and SQLite Durable Object migration are declared in `wrangler.toml`. Ensure the deployment's Worker bundle exports the `DocumentSession` class from `src/document-session.ts`; Pages/Next adapters may require explicitly including that export in their Worker entrypoint.

## WebSocket Message Schemas

Messages are JSON objects. Server events include the `open` snapshot, presence notifications, save notifications, and protocol errors.

### Open Snapshot (server to client)

```json
{
  "type": "open",
  "documentId": "doc_123",
  "content": "# Notes\n\nShared text"
}
```

### Cursor Update (client to room, broadcast to other clients)

`position` and optional `selection.anchor` / `selection.head` are zero-based character offsets.

```json
{
  "type": "cursor",
  "position": 12,
  "selection": { "anchor": 12, "head": 18 }
}
```

### Text Patch (client to room, broadcast to other clients)

The patch removes `deleteCount` characters starting at `start`, then inserts `insert` at that offset. Offsets are zero-based JavaScript string positions. Clients should apply received patches in arrival order.

```json
{
  "type": "text-patch",
  "start": 12,
  "deleteCount": 4,
  "insert": "shared"
}
```

### Presence and Save Events (server to clients)

```json
{ "type": "presence", "event": "open" }
{ "type": "presence", "event": "close" }
{ "type": "save", "documentId": "doc_123", "savedAt": 1782345600000 }
```

Protocol errors are sent to the originating socket as `{ "type": "error", "error": "..." }`. This basic patch protocol is suitable for a single room authority; clients needing conflict-free concurrent editing should use a CRDT or OT layer rather than assuming patches commute.

## Local Wrangler Testing

Apply the D1 schema locally and build the Pages output first. Wrangler uses local Durable Object storage by default; `--persist-to` selects a stable state directory across invocations.

```sh
npx wrangler d1 migrations apply DB --local
npx wrangler pages dev .vercel/output/static --do DOCUMENT_SESSIONS=DocumentSession --persist-to .wrangler/state
```

Connect two WebSocket clients to the same room URL to verify they share one session:

```text
ws://localhost:8788/api/realtime?documentId=doc_123
```

The application needs a WebSocket route or client-side Cloudflare binding call that forwards upgrades to `env.DOCUMENT_SESSIONS.get(env.DOCUMENT_SESSIONS.idFromName(documentId))`. After both clients connect, send a `cursor` or `text-patch` JSON message from one client and confirm only the other receives it. Wait for the `save` event and verify the D1 row changed with `npx wrangler d1 execute DB --local --command "SELECT content, updated_at FROM documents WHERE id = 'doc_123';"`.

To inspect local Wrangler support for the `--do` class mapping in your installed version, run `npx wrangler pages dev --help`. If the Next-on-Pages build does not bundle the Durable Object class export, run the class from a dedicated Wrangler Worker entrypoint and bind the Pages application to that deployed Worker instead.