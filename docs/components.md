# Components

## Collaborative Markdown Editor

`components/Editor.tsx` is a client component styled with Tailwind CSS and Lucide React. It provides Markdown formatting controls, image uploads, AI summaries, a semantic search drawer, and WebSocket synchronization for a document.

### Usage

```tsx
import Editor from "../../../components/Editor";

export default function DocumentPage() {
  return (
    <Editor
      documentId="doc_123"
      initialContent="# Project notes\n"
      mediaUrlForKey={(key) => `https://media.example.com/${key}`}
      onContentChange={(content) => console.log("Current characters:", content.length)}
    />
  );
}
```

`documentId` must identify an existing D1 document. The editor connects to `/api/realtime?documentId=...`, which must forward the WebSocket upgrade to the `DocumentSession` Durable Object. It consumes the `open`, `text-patch`, `presence`, and `save` protocol events documented in `architecture-realtime.md`.

The toolbar calls `POST /api/ai/summarize` and direct multipart `POST /api/upload`. The upload endpoint currently returns an R2 `mediaKey`, not a browser URL. Supply `mediaUrlForKey` to map that key to a public R2 custom domain or an implemented media-serving route; the default points to `/api/media/<encoded-key>` and requires that route to exist.

The insights drawer sends semantic searches as `GET /api/search?query=...` and reads `{ "results": [{ "document": { "id": string, "title": string, "content": string }, "score": number }] }`. It derives a short snippet from each document's content. Override `searchEndpoint` to use another route.

`webSocketUrl` may override the default same-origin WebSocket URL. Use a `ws://` or `wss://` URL; the component adds the `documentId` query parameter automatically. `onContentChange` receives both local edits and remote patches.