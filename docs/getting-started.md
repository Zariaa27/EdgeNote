# Getting Started

EdgeNote runs as a Cloudflare Worker built with Next.js and OpenNext. The production entrypoint is `worker.ts`; do not deploy it as a Pages project. `npm run dev` starts the Next.js development server, while `npm run preview` builds the OpenNext Worker and runs it in Wrangler with Cloudflare bindings.

## Prerequisites

- Node.js 20 or newer and npm.
- A Cloudflare account with Workers, D1, R2, Workers KV, Workers AI, Vectorize, and Durable Objects available.
- Wrangler authentication (`npx wrangler login`) or a narrowly scoped Cloudflare API token.

Install dependencies and create the local Drizzle environment:

```sh
npm ci
cp .env.example .env.local
npx wrangler login
```

## Create Cloudflare Resources

Create the remote resources in the Cloudflare account used by Wrangler. Save each returned ID:

```sh
npx wrangler d1 create edgenote-db
npx wrangler r2 bucket create edgenote-storage
npx wrangler kv namespace create CACHE
npx wrangler vectorize create edgenote-index --dimensions=384 --metric=cosine
npx wrangler vectorize create-metadata-index edgenote-index --propertyName=ownerId --type=string
```

Set the D1 `database_id` and KV `id` in `wrangler.toml`. The D1 database name, R2 bucket name, and Vectorize index name must match the resource names above. The Vectorize index is 384-dimensional because `@cf/baai/bge-small-en-v1.5` generates 384-value embeddings.

The `ownerId` metadata index is required: document embeddings include that metadata and semantic search filters on it to keep results private to their owner. Wait for Wrangler to confirm the metadata index is available before testing search. Vectorize processes upserts asynchronously; during staging verification, a new vector took about 35 seconds to become searchable. Retest after the index processes the mutation rather than treating an immediate empty result as a binding failure.

Workers AI is bound through the `[ai]` entry and does not need a separately-created resource. Durable Objects are bound to the `DocumentSession` class exported by `worker.ts`; Wrangler applies the SQLite class migration declared in `wrangler.toml`.

## Configure Environment and Secrets

`.env.local` is used by Drizzle Kit for remote D1 operations. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN` there. Load those values into your shell before running Drizzle Kit:

```sh
set -a
. ./.env.local
set +a
```

For local Worker development, create `.dev.vars` in the repository root with two independent random secrets:

```text
AUTH_SECRET=replace-with-at-least-32-random-bytes
UPLOAD_SIGNING_SECRET=replace-with-a-different-random-secret
```

Generate unique values of at least 32 random bytes; do not use the example placeholders. Keep `.env.local` and `.dev.vars` untracked. Set the same secrets in the production Worker environment; Wrangler prompts for each secret value:

```sh
npx wrangler secret put AUTH_SECRET
npx wrangler secret put UPLOAD_SIGNING_SECRET
```

Do not use the Drizzle API token as an application secret or put secrets in `wrangler.toml` or any `NEXT_PUBLIC_*` variable.

Account verification, email changes, and password recovery use Resend for transactional email. Configure the Resend API key as a Worker secret, set a verified sender address and the public app URL as Worker variables, and add these local values to `.dev.vars` for local development:

```text
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=EdgeNote <accounts@example.com>
APP_URL=http://localhost:8787
```

Use the deployed HTTPS URL for `APP_URL` in staging/production. Without these values, registration will not complete email verification, and the verification/reset actions will explicitly report that email delivery is not configured. Never commit the Resend key.

## Apply Database Migrations

The initial migration is checked into `drizzle/`. Apply it to the local D1 emulator before using the app:

```sh
npm run db:migrate:local
npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

When the schema changes, generate a new migration from `src/db/schema.ts`, review the generated SQL, and apply it locally:

```sh
npm run db:generate
npm run db:migrate:local
```

Apply reviewed migrations to production before deploying code that depends on them:

```sh
npm run db:migrate:remote
```

## Develop and Verify Locally

For UI work, run the Next.js dev server:

```sh
npm run dev
```

To build and run the app in Wrangler's Cloudflare runtime with local D1, R2, KV, and Durable Object storage:

```sh
npm run preview
```

Wrangler serves the Worker at `http://localhost:8787` by default. Guests see the public landing page at `/`; once signed in, opening `/` redirects to `/workspace`. Local development needs the secrets from `.dev.vars`, a local D1 migration, and Cloudflare authentication for Workers AI's remote binding (use `npx wrangler login`, or `CLOUDFLARE_API_TOKEN` in non-interactive environments). Vectorize has no local emulator; validate search against a configured remote binding or a non-production deployment.

Register or sign in through the app before exercising authenticated endpoints. Test note creation with private/public access and email invitations, editing, owner deletion, leaving a shared note, `/api/ai/summarize`, `/api/search`, image upload/media retrieval, realtime synchronization with two clients, account verification, password recovery, account export, account deletion, public view-only links, and viewer/editor email shares. Email invitations require Resend configuration. The editor reports WebSocket connectivity separately from persistence; its save-status button requests an immediate save, while automatic saves continue in the background. “Saved” is shown only after a Durable Object acknowledgement confirms the corresponding revision was written to D1. The realtime preflight also checks that the document's Durable Object room can load before attempting the WebSocket upgrade. Account settings are at `/settings`. Visit `/admin` to see operational analytics only when signed in as `alexistrudeau94@gmail.com`; the analytics API enforces this restriction on the server. See [API Routes](api-routes.md) and [Real-Time Collaboration Architecture](architecture-realtime.md) for request formats and the WebSocket protocol.

Run static checks and a production build before deploying:

```sh
npm run typecheck
npm run lint
npm run build
```

The build command first runs `next build` and then packages the result for Cloudflare Workers. `open-next.config.ts` intentionally configures the inner build command to avoid recursively invoking the OpenNext build script.

## Deploy to Cloudflare Workers

Confirm `wrangler.toml` contains the production D1 and KV IDs and that the Worker secrets are configured. Apply the reviewed D1 migrations, then build and deploy:

```sh
npm run db:migrate:remote
npm run deploy
```

Configure the production domain in the Cloudflare Worker settings. After deployment, verify the app can register/sign in, access only the current user's documents, save edits to D1, resolve uploaded media, use AI/search, and reconnect realtime clients. Do not use production credentials or `--remote` for local experiments.
