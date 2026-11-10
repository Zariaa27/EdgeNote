# API Routes

Private document, realtime editing, AI, search, upload, account, and admin analytics endpoints require an authenticated session. Public documents can be fetched read-only without signing in; private documents are visible to their owner and users with a verified email share. Register or log in first; registration sends an email verification link and the account must be verified before sign-in. The response sets the `edgenote_session` HttpOnly cookie. The curl examples below assume that cookie is saved in `cookies.txt` and passed with `-b cookies.txt`. Authentication endpoints, public document reads, and logout are not covered by that requirement.

For example, register an account (then verify its email); sign in to receive a cookie before calling protected endpoints:

```sh
curl http://localhost:8787/api/auth/register \
  -H 'Content-Type: application/json' \
  --data '{"name":"Alex Morgan","email":"alex@example.com","password":"use-a-unique-long-password","termsAccepted":true}'

curl -c cookies.txt http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"alex@example.com","password":"use-a-unique-long-password"}'
```

Registration requires `termsAccepted: true`; the server records the acceptance timestamp and policy version. The UI acknowledgement also confirms the user is at least 13 and meets any higher local age or guardian-consent requirements.

## `GET /api/admin/analytics`

Returns account and document totals, counts created during the last seven days, daily activity for the last week, and the eight most recently created accounts. This endpoint is restricted server-side to the account `alexistrudeau94@gmail.com`; other authenticated accounts receive `403`, and unauthenticated requests receive `401`. The response is private and is sent with `Cache-Control: no-store`.

## Account settings and data

- `GET /api/account` returns the signed-in profile and email verification status.
- `PATCH /api/account` requires the current password and updates either the display name or requests an email change. Email changes take effect only after confirming the message sent to the new address.
- `GET /api/account/export` downloads JSON containing the account, documents, attachment metadata, and base64-encoded uploaded image bytes.
- `DELETE /api/account` requires the current password and the exact confirmation value `DELETE`; it removes the account, its document collaboration rooms, Vectorize records, and R2 uploads.
- `POST /api/auth/verification/resend` requests an email verification message. `POST /api/auth/verification/confirm` consumes the one-time link token.
- `POST /api/auth/password-reset` requests a reset link. `POST /api/auth/password-reset/confirm` consumes the one-time token and updates the password.

Configure `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` before using email-dependent workflows. Cloudflare Email Routing may forward replies to the configured sender address, while Resend delivers outbound messages. Successful password sign-ins trigger a security notification; notification delivery is best-effort and does not block authentication. Reset and verification requests return generic success messages whether an account exists or not; verification resend is limited to one request per five minutes per account, with an additional five-minute browser-session cooldown in the login and verification forms. Reset and verification tokens are hashed at rest and expire. See [Email Setup](email-setup.md).

Public legal pages are available at `/terms`, `/privacy`, and `/cookies`. Signup acceptance is recorded with the account; existing accounts are not blocked pending retroactive acceptance. The current cookie notice describes essential authentication and browser preference storage only.

## Document sharing

- Documents are private by default. Owners can turn on an unlisted, view-only link from the document's **Share** control. Public note routes and media are not indexed and use non-cacheable responses.
- Owners can grant `viewer` or `editor` access by email. The invited user must have a verified EdgeNote account using that exact email; an existing verified account sees the note in its workspace, while unregistered or unverified addresses receive a Resend invitation.
- Shared notes appear in the recipient's workspace. Viewers can read but cannot edit or open a realtime editing socket. Editors can edit the title and content; realtime writes re-check the grant, and are denied after permission revocation.
- Only owners can change public-link status or manage/remove other people's email grants. A recipient can remove their own email grant by sending `DELETE /api/documents/:documentId/shares` without a `shareId`; owners remove a specific grant with `DELETE /api/documents/:documentId/shares?shareId=...`.
- Owners can delete a note with `DELETE /api/documents/:documentId`. This also clears its collaboration room, Vectorize entry, uploaded R2 objects, attachments, and share grants. Deleting an account removes that user's inbound email grants as well as their owned data.
- Inviting by email requires `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL`. If delivery fails, the grant is still stored, and the API reports that permission was saved but the invitation email failed.

## `POST /api/ai/summarize`

Generates a concise, source-grounded summary from the document's latest content persisted in D1, embeds that same content, and upserts its vector for semantic search. The editor requests a confirmed Durable Object save first, so the summary uses saved content rather than an arbitrary client-provided copy. The route also reads the title and owner from D1 for Vectorize metadata.

### Required Cloudflare Bindings

- `DB`: D1 binding used to load the document title.
- `AI`: Workers AI binding used for both text generation and embeddings.
- `VECTOR_INDEX`: Vectorize binding where the content embedding is upserted with `documentId` as its ID and `{ "title": "...", "ownerId": "..." }` as metadata.

These bindings are configured in `wrangler.toml`. The route obtains its bindings from `getCloudflareContext()` in `@opennextjs/cloudflare` and requires a signed-in owner or editor of the document.

### Request

Content type: `application/json`.

```json
{
  "documentId": "doc_123"
}
```

`documentId` is required. The saved document content must be non-empty and no longer than 50,000 characters. Summary generation uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with low sampling and instructions to preserve names, dates, quantities, uncertainty, and conflicts without adding unsupported claims. Search embeddings use `@cf/baai/bge-small-en-v1.5`. The caller must be the owner or a shared editor; viewers cannot request summaries.

### Responses

Success (`200`):

```json
{
  "documentId": "doc_123",
  "summary": "The team agreed to ship the first release next week."
}
```

An embedding or Vectorize failure does not discard a generated summary; the response includes `indexingWarning` when search indexing could not be updated. Invalid JSON or fields return `400`; an unknown document returns `404`; notes over the length limit return `413`; view-only access returns `403`; an invalid AI response returns `502`; processing or binding failures return `500`. Errors use `{ "error": string }`.

### Examples

Against the local Wrangler Worker runtime (default port `8787`; sign in first to send the session cookie):

```sh
curl -b cookies.txt http://localhost:8787/api/ai/summarize \
  -H 'Content-Type: application/json' \
  --data '{"documentId":"doc_123"}'
```

Against a deployed Worker:

```sh
curl -b cookies.txt https://your-worker-domain.example/api/ai/summarize \
  -H 'Content-Type: application/json' \
  --data '{"documentId":"doc_123"}'
```

## `POST /api/upload`

Stores an image in the `STORAGE` R2 bucket and records its details in the D1 `attachments` table. The document identified by `documentId` must already exist, and the signed-in user must be its owner or editor. Images are limited to 10 MiB and the accepted MIME types are `image/avif`, `image/gif`, `image/jpeg`, `image/png`, and `image/webp`. The route validates file signatures as well as declared MIME types; SVG and other types are rejected.

The route runs on the Cloudflare Worker and requires:

- `STORAGE`: R2 bucket binding used to write and clean up objects.
- `DB`: D1 binding used by Drizzle to validate the document and insert the attachment row.
- `AUTH_SECRET`: a Worker secret used to sign session cookies.
- `UPLOAD_SIGNING_SECRET`: a Worker secret used to sign short-lived upload URLs. Set it with `npx wrangler secret put UPLOAD_SIGNING_SECRET`; for local development put it in `.dev.vars`.

### Direct Multipart Upload

Send `multipart/form-data` fields `documentId` and `file`:

```sh
curl -b cookies.txt http://localhost:8787/api/upload \
  -F 'documentId=doc_123' \
  -F 'file=@./diagram.png;type=image/png'
```

A successful upload returns `201` with the `attachmentId` and `mediaKey` (the R2 key) for the uploaded object.

### Signed Upload URL

The JSON POST mode creates a five-minute, application-signed URL. The client uploads the raw file bytes to that URL with `PUT`; the route verifies the signature, declared MIME type, and exact file size, then writes to R2 and inserts the attachment row. This is a signed URL handled by the app, not a direct S3-compatible R2 URL.

Request a URL:

```sh
curl -b cookies.txt http://localhost:8787/api/upload \
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

Wrangler emulates the configured R2 bucket locally when running the Worker. No separate local bucket creation is needed; use the same bucket name in `wrangler.toml`:

```sh
npx wrangler dev --persist-to .wrangler/state
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
curl --get 'http://localhost:8787/api/search' \
  -b cookies.txt \
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

No matches return `{ "query": "...", "results": [] }`. Vectorize processes upserts asynchronously, so a newly summarized document may not appear immediately; retry the search after the upsert has been processed. Successful responses include `Cache-Control: no-store` because result documents are private. A missing or invalid query returns `400`; an invalid embedding returns `502`; binding or database failures return `500`. Errors use `{ "error": string }`.

### Required Bindings and Vectorize Configuration

- `AI`: Workers AI binding used with `@cf/baai/bge-small-en-v1.5` to embed the query.
- `VECTOR_INDEX`: Vectorize binding queried with `topK: 5`.
- `DB`: D1 binding used by Drizzle to load matched rows from `documents`.

These bindings are configured in `wrangler.toml`; the route obtains them through `getCloudflareContext()` from `@opennextjs/cloudflare`. The Vectorize index must use the same model and dimensions as the embeddings written by the summarize route. `@cf/baai/bge-small-en-v1.5` produces 384-dimensional vectors; the configured index is named `edgenote-index` and should use cosine distance. Create it and its required owner metadata index with `npx wrangler vectorize create edgenote-index --dimensions=384 --metric=cosine` and `npx wrangler vectorize create-metadata-index edgenote-index --propertyName=ownerId --type=string`. Wait for the metadata index creation to complete before querying. An index with a different dimension must be replaced and its vectors reindexed before this route can query it.