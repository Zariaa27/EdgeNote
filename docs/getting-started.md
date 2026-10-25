# Getting Started

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