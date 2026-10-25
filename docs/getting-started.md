# Run EdgeNote on Cloudflare

## Current State: Deployment Blocked

This checkout is not yet a runnable Next.js app. It has no `package.json`, Next.js root page/layout, or package scripts. The existing `app/` directory contains API routes only. Real-time editing also needs an `/api/realtime` WebSocket upgrade route and a Pages/Worker entrypoint that exports `DocumentSession`. The editor's default image URL needs a media-serving route or a public R2 URL.

Do not expect `npm run dev`, a build, or deployment to work until those pieces are added. The steps below cover the exact Cloudflare setup and commands to run once the app shell and Cloudflare adapter wiring are in place.

## 1. Clone the Repository

Install Git, Node.js 20 or newer, and npm, then run:

```sh
git clone https://github.com/Zariaa27/EdgeNote.git
cd EdgeNote
```

## 2. Complete the Next.js App Shell

Before installing or building, add a Next.js 15 app manifest and configuration compatible with the Cloudflare Pages adapter used by this project. At minimum, the repository needs:

- `package.json` with `dev`, `build`, and a Pages build script that produces `.vercel/output/static`.
- Dependencies for Next.js 15, React, Drizzle ORM, Drizzle Kit, Wrangler, Lucide React, and `@cloudflare/next-on-pages`.
- `app/layout.tsx` and `app/page.tsx`; the page should mount `components/Editor` with an existing D1 document ID.
- A WebSocket route that forwards `/api/realtime?documentId=...` to the `DOCUMENT_SESSIONS` Durable Object, and an adapter Worker entrypoint that exports the `DocumentSession` class.
- A media-serving route or public R2 custom domain. `/api/upload` returns a media key, not a browser URL.

Use a Cloudflare-supported Next.js 15 adapter configuration. The existing Wrangler configuration expects Pages output at `.vercel/output/static`; do not deploy until your build actually creates that directory. For Durable Object/WebSocket wiring, follow [the real-time architecture guide](architecture-realtime.md).

After `package.json` exists, install its dependencies with:

```sh
npm install
npx wrangler login
```

## 3. Create Cloudflare Resources

These commands create remote resources in the Cloudflare account authenticated by Wrangler. Save every returned ID.

```sh
npx wrangler d1 create edgenote-db
npx wrangler r2 bucket create edgenote-storage
npx wrangler kv namespace create CACHE
npx wrangler vectorize create edgenote-index --dimensions=384 --metric=cosine
```

Workers AI does not need a separate namespace; enable it for the account if prompted. The Vectorize index must be 384-dimensional because this project embeds with `@cf/baai/bge-small-en-v1.5`.

Edit `wrangler.toml` and replace `REPLACE_WITH_D1_DATABASE_ID` and `REPLACE_WITH_KV_NAMESPACE_ID` with the IDs from Wrangler. Keep the configured D1 database, R2 bucket, KV binding, Vectorize index, and Durable Object class names in sync with the resources and Worker exports.

## 4. Configure Credentials and Secrets

Create local Drizzle credentials from the template:

```sh
cp .env.example .env.local
```

Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN` in `.env.local`. Drizzle Kit uses these for remote D1 access. Load them into the shell before running Drizzle commands:

```sh
set -a
. ./.env.local
set +a
```

For local signed image uploads, put a generated secret in `.dev.vars`:

```text
UPLOAD_SIGNING_SECRET=replace-with-a-random-secret
```

Ensure `.env.local` and `.dev.vars` are in `.gitignore`; never commit Cloudflare tokens or upload secrets. For production, set the upload secret separately:

```sh
npx wrangler pages secret put UPLOAD_SIGNING_SECRET
```

## 5. Generate and Apply Database Migrations

Generate SQL from `src/db/schema.ts`, then apply it to the local D1 emulator:

```sh
npx drizzle-kit generate --name=initial
npx wrangler d1 migrations apply DB --local
```

The generated migrations go into `drizzle/`, which is also configured as the D1 `migrations_dir`. To inspect the local database:

```sh
npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

For production, apply migrations only after verifying them:

```sh
npx wrangler d1 migrations apply DB --remote
```

## 6. Build and Test Locally

The app shell and adapter setup from step 2 must provide the Pages build script. Build the output and run it in Wrangler's local Pages runtime:

```sh
npm run pages:build
npx wrangler pages dev .vercel/output/static --do DOCUMENT_SESSIONS=DocumentSession --persist-to .wrangler/state
```

Wrangler serves Pages at `http://localhost:8788` by default and emulates D1, R2, and KV locally. Vectorize has no local emulator; search requires the configured remote index. Test the API routes at `/api/ai/summarize`, `/api/search?query=...`, and `/api/upload`. Real-time sync additionally requires the WebSocket route from step 2.

`npm run dev` is the Next.js development server. Use the Wrangler Pages command above to test Cloudflare bindings; the two commands are not interchangeable.

## 7. Deploy to Cloudflare Pages

Create the Pages project once, apply reviewed migrations, build the Pages output, and deploy it:

```sh
npx wrangler pages project create edgenote
npx wrangler d1 migrations apply DB --remote
npm run pages:build
npx wrangler pages deploy .vercel/output/static --project-name=edgenote
```

If the Pages project already exists, skip its create command. Configure the production domain in Cloudflare Pages. Confirm the Pages deployment includes the D1, R2, KV, AI, Vectorize, and Durable Object bindings from `wrangler.toml`, and that the Worker bundle exports `DocumentSession`.

## 8. Verify the Deployment

- Open the Pages deployment URL and load a document that exists in D1.
- Call `GET /api/search?query=...` and verify it returns document rows and similarity scores.
- Upload an image and confirm the resulting media key resolves through your media route or R2 custom domain.
- Connect two browser sessions to the same document and confirm edits synchronize and are saved to D1.

For endpoint payloads and response examples, see [API Routes](api-routes.md). For schema and seed SQL, see [Database Schema](database-schema.md).# Getting Started

## Prerequisites

- Node.js 20 LTS or newer and npm.
- A Cloudflare account with Pages, D1, R2, Workers KV, Workers AI, and Vectorize available. Some services may require billing or an account-level enablement step.
- A Cloudflare API token with the permissions needed to manage D1, R2, Workers KV, Vectorize, and Pages. Use a narrowly scoped token for your account.
- Wrangler CLI. From the project root, install it as a development dependency with `npm install --save-dev wrangler`, then use `npx wrangler` for commands. Authenticate with `npx wrangler login`.

## Create Cloudflare Resources

Wrangler's local mode is used for development. D1 creates a local database on first use; R2 and KV are emulated locally by Wrangler. Vectorize has no local emulator, so its binding requires a remote index. Resource creation commands below create the remote resources in your Cloudflare account.

After your Next.js-on-Pages adapter has generated `.vercel/output/static`, start the local Pages runtime with:

```sh
npx wrangler pages dev .vercel/output/static
```

This starts the app with local D1, R2, and KV bindings from `wrangler.toml`. Use the remote-resource commands below to create the production resources; you do not create separate remote R2 or KV resources for local development.

### D1

Create the database and save the returned database ID:

```sh
npx wrangler d1 create edgenote-db
```

Set the returned ID as `database_id` in `wrangler.toml` in the `[[d1_databases]]` entry. Local use is available through commands such as `npx wrangler d1 execute DB --local --command "SELECT 1"`; use `--remote` to execute against the Cloudflare database.

### R2

```sh
npx wrangler r2 bucket create edgenote-storage
```

The bucket name must match `bucket_name` in the `[[r2_buckets]]` entry in `wrangler.toml`. Local development uses Wrangler's R2 emulator; it does not need a separately-created local bucket.

### KV

```sh
npx wrangler kv namespace create CACHE
```

Copy the returned namespace ID into `id` in the `[[kv_namespaces]]` entry in `wrangler.toml`. Wrangler provides local KV emulation during local development.

### Workers AI

Workers AI is enabled through the account's AI access; there is no namespace or index to create. The `[ai]` entry in `wrangler.toml` binds it to the application as `AI`. Confirm Workers AI is available for your account before deploying.

### Vectorize

The configured embedding model, `@cf/baai/bge-small-en-v1.5`, produces 384-dimensional vectors. Create an index with matching dimensions and cosine distance:

```sh
npx wrangler vectorize create edgenote-index --dimensions=384 --metric=cosine
```

The index name must match `index_name` in the `[[vectorize]]` entry in `wrangler.toml`. Vectorize is remote-only; local Pages development must be configured to use the remote index if that functionality is needed.

## Environment Variables

Copy the template to your local environment file:

```sh
cp .env.example .env.local
```

Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN` in `.env.local` for Drizzle Kit's D1 HTTP driver. The token must be permitted to access the specified D1 database. Keep `.env.local` out of version control and do not put API tokens in `NEXT_PUBLIC_*` variables. The optional `NEXT_PUBLIC_APP_URL` is safe to expose to client code.

The D1, R2, KV, Workers AI, and Vectorize bindings are supplied by the Cloudflare runtime through `wrangler.toml`; do not duplicate those bindings as application secrets. Replace the D1 and KV placeholder IDs in that file with the IDs returned by Wrangler before deploying. The R2 bucket and Vectorize index names in the file must match the resources you created.

To use Drizzle Kit, install the project dependencies that provide `drizzle-kit` and `drizzle-orm`, then add the application's schema at `src/db/schema.ts` or update the `schema` path in `drizzle.config.ts`. Generate migrations with `npx drizzle-kit generate`. Apply migrations to local D1 with `npx wrangler d1 migrations apply DB --local`, or to Cloudflare D1 with `npx wrangler d1 migrations apply DB --remote`.