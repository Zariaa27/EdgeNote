# Real-Time Collaboration Architecture

## Document Rooms

Each document room is backed by one `DocumentSession` Durable Object. The application should derive its Durable Object ID from the document ID (for example, with `idFromName(documentId)`) so clients editing the same document reach the same object. The object accepts a WebSocket upgrade with `?documentId=<id>`, loads the document through Drizzle and D1, and sends the current content in an `open` event.

The Durable Object keeps active WebSocket references in an in-memory set and uses the hibernation-aware WebSocket API. Open connections are also recoverable through `state.getWebSockets()` after the object wakes. Message and close callbacks are handled by `webSocketMessage`, `webSocketClose`, and `webSocketError`. Every room is isolated from other rooms by its Durable Object ID.

Text edits are broadcast to every connected socket except the sender. The object applies each patch to its current in-memory content, assigns a monotonically increasing room revision, and stores the draft and revision in Durable Object storage so an object restart before the next database save does not discard the latest patch. A Durable Object alarm runs five seconds after the latest edit; it writes the latest content and `updatedAt` to the D1 `documents` row with Drizzle. The `save` event includes the highest persisted revision, and clients only show Saved after that revision covers their latest known edit. A failed D1 write is reported as a `save-error` and retried by a later alarm.

The client awaits an authenticated HTTP preflight before opening the WebSocket. The preflight checks both document ownership in D1 and that the corresponding Durable Object room can load the document. Missing sessions, inaccessible documents, and room-load failures are reported before a socket is attempted. The client also times out a socket that opens without a document snapshot, retries transient failures with backoff, and exposes a manual Retry action after repeated failures. Each accepted edit receives a `patch-accepted` acknowledgement after its Durable Object draft is stored; this is distinct from the later D1 `save` acknowledgement. The save-status button sends an explicit save request to the room, which persists its current revision immediately; automatic alarm-based saves remain enabled.

The OpenNext Worker entrypoint in `worker.ts` exports both the generated application Worker and `DocumentSession`. It intercepts `/api/realtime` before dispatching into Next.js and returns the Durable Object response directly. This is required because OpenNext's Node-style App Router response adapter serializes ordinary response status, headers, and body, but does not preserve Cloudflare's WebSocket upgrade response. The authenticated handler validates document ownership before forwarding the upgrade. The `DOCUMENT_SESSIONS` binding and SQLite class migration are declared in `wrangler.toml`; deploy them together with the application.

## WebSocket Message Schemas

Messages are JSON objects. Server events include the `open` snapshot, presence notifications, save notifications, and protocol errors.

### Open Snapshot (server to client)

```json
{
  "type": "open",
  "documentId": "doc_123",
  "content": "# Notes\n\nShared text",
  "revision": 4,
  "persistedRevision": 4
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
  "insert": "shared",
  "clientMutationId": "unique-per-edit"
}
```

### Presence and Save Events (server to clients)

```json
{ "type": "presence", "event": "open" }
{ "type": "presence", "event": "close" }
{ "type": "patch-accepted", "clientMutationId": "unique-per-edit", "revision": 5 }
{ "type": "save", "documentId": "doc_123", "revision": 5, "savedAt": 1782345600000 }
{ "type": "save-error", "revision": 5 }
```

### Save Request (client to room)

```json
{ "type": "save" }
```

Protocol errors are sent to the originating socket as `{ "type": "error", "error": "..." }`. This basic patch protocol is suitable for a single room authority; clients needing conflict-free concurrent editing should use a CRDT or OT layer rather than assuming patches commute.

## Local Wrangler Testing

Apply the D1 schema locally and run the Worker with Wrangler. Wrangler uses local Durable Object storage by default; `--persist-to` selects a stable state directory across invocations.

```sh
npm run db:migrate:local
npm run build
npx wrangler dev --persist-to .wrangler/state
```

Connect two WebSocket clients to the same room URL to verify they share one session:

```text
ws://localhost:8787/api/realtime?documentId=doc_123
```

Sign in before connecting; the WebSocket route accepts only documents owned by that account. After both clients connect, send a `cursor` or `text-patch` JSON message from one client and confirm only the other receives it. Wait for the `save` event and verify the D1 row changed with `npx wrangler d1 execute DB --local --command "SELECT content, updated_at FROM documents WHERE id = 'doc_123';"`.