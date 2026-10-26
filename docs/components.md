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

The toolbar calls `POST /api/ai/summarize` and direct multipart `POST /api/upload`. Before requesting a summary, the editor waits for the Durable Object to confirm its latest revision was saved; the API summarizes that persisted document content, not client-supplied text. Owners and shared editors can summarize notes and upload images; viewers cannot edit or use these tools. Summary generation uses Cloudflare's Llama 3.3 70B model with source-fidelity instructions; search embedding failures are reported separately without hiding the generated summary. The upload endpoint returns an R2 `mediaKey`, not a public URL. The default `mediaUrlForKey` maps it to the authorized `/api/media?key=<encoded-key>` route; callers may override it to use a different authorized media endpoint.

The insights drawer sends semantic searches as `GET /api/search?query=...` and reads `{ "results": [{ "document": { "id": string, "title": string, "content": string }, "score": number }] }`. It derives a short snippet from each document's content. Override `searchEndpoint` to use another route.

`webSocketUrl` may override the default same-origin WebSocket URL. Use a `ws://` or `wss://` URL; the component adds the `documentId` query parameter automatically. `onContentChange` receives both local edits and remote patches.