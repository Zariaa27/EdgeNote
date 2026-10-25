# API Routes

## `POST /api/ai/summarize`

Generates a three-sentence summary of Markdown content, embeds the content, and upserts that vector for the document. The route looks up the document title in D1 for Vectorize metadata, so `documentId` must identify an existing row in `documents`.

### Required Cloudflare Bindings

- `DB`: D1 binding used to load the document title.
- `AI`: Workers AI binding used for both text generation and embeddings.
- `VECTOR_INDEX`: Vectorize binding where the content embedding is upserted with `documentId` as its ID and `{ "title": "..." }` as metadata.

These bindings are configured in `wrangler.toml`. The route runs on the Edge Runtime and obtains its bindings from `getRequestContext()` in `@cloudflare/next-on-pages`.

### Request

Content type: `application/json`.

```json
{
  "documentId": "doc_123",
  "content": "# Project notes\n\nThe team agreed to ship the first release next week."
}
```

Both fields are required non-empty strings. `content` is sent to `@cf/meta/llama-3-8b-instruct` for summarization and `@cf/baai/bge-small-en-v1.5` for embedding. The title is read from D1, not supplied by the client.

### Responses

Success (`200`):

```json
{
  "documentId": "doc_123",
  "summary": "The team aligned on the initial release plan. The first release is scheduled for next week. These notes capture the team's delivery decision."
}
```

Invalid JSON or fields return `400`; an unknown document returns `404`; an invalid AI response returns `502`; processing or binding failures return `500`. Errors use `{ "error": string }`.

### Examples

Against the local Pages runtime (default port `8788`):

```sh
curl http://localhost:8788/api/ai/summarize \
  -H 'Content-Type: application/json' \
  --data '{"documentId":"doc_123","content":"# Project notes\n\nThe team agreed to ship the first release next week."}'
```

Against a deployed Pages application:

```sh
curl https://your-pages-domain.example/api/ai/summarize \
  -H 'Content-Type: application/json' \
  --data '{"documentId":"doc_123","content":"# Project notes\n\nThe team agreed to ship the first release next week."}'
```

## `POST /api/upload`

Stores an image in the `STORAGE` R2 bucket and records its details in the D1 `attachments` table. The document identified by `documentId` must already exist. Images are limited to 10 MiB and the accepted MIME types are `image/avif`, `image/gif`, `image/jpeg`, `image/png`, and `image/webp`. The route validates file signatures as well as declared MIME types; SVG and other types are rejected.

The route runs on the Edge Runtime and requires:

- `STORAGE`: R2 bucket binding used to write and clean up objects.
- `DB`: D1 binding used by Drizzle to validate the document and insert the attachment row.
- `UPLOAD_SIGNING_SECRET`: a secret used to sign short-lived upload URLs. Set it with `npx wrangler pages secret put UPLOAD_SIGNING_SECRET`; for local development put it in `.dev.vars`.

### Direct Multipart Upload

Send `multipart/form-data` fields `documentId` and `file`:

```sh
curl http://localhost:8788/api/upload \
  -F 'documentId=doc_123' \
  -F 'file=@./diagram.png;type=image/png'
```

A successful upload returns `201` with the `attachmentId` and `mediaKey` (the R2 key) for the uploaded object.

### Signed Upload URL

The JSON POST mode creates a five-minute, application-signed URL. The client uploads the raw file bytes to that URL with `PUT`; the route verifies the signature, declared MIME type, and exact file size, then writes to R2 and inserts the attachment row. This is a signed URL handled by the app, not a direct S3-compatible R2 URL.

Request a URL:

```sh
curl http://localhost:8788/api/upload \
  -H 'Content-Type: application/json' \
  --data '{"mode":"presign","documentId":"doc_123","fileName":"diagram.png","fileSize":48231,"mimeType":"image/png"}'
```

Use the returned `uploadUrl` for the file bytes:

```sh
curl -X PUT 'RETURNED_UPLOAD_URL' \
  -H 'Content-Type: image/png' \
  --data-binary '@./diagram.png'
```

Both upload flows return `201` with `{ "attachmentId": "...", "mediaKey": "attachments/..." }`. The media key is not itself a public URL; serve it through an authorized application route or configure a separate public R2 custom domain.

### Local R2 Emulation

Wrangler emulates the configured R2 bucket locally when running the Pages app. No separate local bucket creation is needed; use the same bucket name in `wrangler.toml` and start the built Pages output:

```sh
npx wrangler pages dev .vercel/output/static
```

Set `UPLOAD_SIGNING_SECRET` in the untracked `.dev.vars` file for the signed-URL flow. Direct multipart uploads only need the local R2 and D1 bindings. Wrangler's local R2 objects persist in its local state directory between runs unless that state is removed.

## `GET /api/search`

Embeds a natural-language query with Workers AI, retrieves the five most similar vectors from Vectorize, then loads the matching complete document rows from D1. Results are returned in descending similarity-score order. Matches with no corresponding D1 document are omitted.

### Parameters

| Name | Location | Required | Description |
| --- | --- | --- | --- |
| `query` | URL query parameter | Yes | Non-empty search text, up to 2,000 characters. |

Example request:

```sh
curl --get 'http://localhost:8788/api/search' \
  --data-urlencode 'query=release planning and next steps'
```

Success (`200`) returns the full matching D1 document record and its Vectorize score:

```json
{
  "query": "release planning and next steps",
  "results": [
    {
      "document": {
        "id": "doc_123",
        "title": "Roadmap",
        "content": "The team plans the next release...",
        "authorId": "user_1",
        "parentFolderId": null,
        "isPublic": false,
        "createdAt": "2026-10-25T12:00:00.000Z",
        "updatedAt": "2026-10-25T12:00:00.000Z"
      },
      "score": 0.87
    }
  ]
}
```

No matches return `{ "query": "...", "results": [] }`. A missing or invalid query returns `400`; an invalid embedding returns `502`; binding or database failures return `500`. Errors use `{ "error": string }`.

### Required Bindings and Vectorize Configuration

- `AI`: Workers AI binding used with `@cf/baai/bge-small-en-v1.5` to embed the query.
- `VECTOR_INDEX`: Vectorize binding queried with `topK: 5`.
- `DB`: D1 binding used by Drizzle to load matched rows from `documents`.

These bindings are configured in `wrangler.toml`; the route obtains them through `getRequestContext()` from `@cloudflare/next-on-pages`. The Vectorize index must use the same model and dimensions as the embeddings written by the summarize route. `@cf/baai/bge-small-en-v1.5` produces 384-dimensional vectors; the configured index is named `edgenote-index` and should use cosine distance. Create it with `npx wrangler vectorize create edgenote-index --dimensions=384 --metric=cosine`. An index with a different dimension must be replaced and its vectors reindexed before this route can query it.