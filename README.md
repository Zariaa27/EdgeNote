# EdgeNote

EdgeNote is an edge-native collaborative Markdown workspace. It combines a lightweight editor with Cloudflare's storage and compute services for document collaboration, AI assistance, semantic discovery, and image attachments.

## Features

- **Markdown editor:** focused writing surface with Markdown formatting controls and image insertion.
- **Real-time sync:** document-room WebSockets backed by a Cloudflare Durable Object, with periodic D1 saves.
- **AI summarization:** generate a concise document summary with Workers AI.
- **Semantic search:** embed a query and retrieve related documents from Vectorize.
- **R2 uploads:** store validated image attachments in R2 and keep their metadata in D1.

## Tech Stack

![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-F38020?logo=cloudflare)
![Workers AI](https://img.shields.io/badge/Cloudflare-Workers%20AI-F38020?logo=cloudflare)
![Vectorize](https://img.shields.io/badge/Cloudflare-Vectorize-F38020?logo=cloudflare)
![Durable Objects](https://img.shields.io/badge/Cloudflare-Durable%20Objects-F38020?logo=cloudflare)

Next.js 15 App Router and React provide the application UI and API routes. Drizzle ORM defines the SQLite schema and D1 access. Cloudflare Pages runs the app at the edge, with D1 for relational document data, R2 for files, Workers AI for inference, Vectorize for embeddings, and Durable Objects for collaborative document rooms.

## Quickstart

See [Getting Started](docs/getting-started.md) for prerequisites, Cloudflare resource creation, local bindings, and environment setup.

At a glance:

```sh
cp .env.example .env.local
npx wrangler login
```

Complete the resource setup in the guide and replace the placeholder IDs in `wrangler.toml`. Set secrets separately with Wrangler; do not commit credentials.

## Command Cheat-Sheet

### Local Development

```sh
npm run dev
```

Use the Next.js dev server for app development once the project dependencies and `dev` script are configured. To run the built Pages output with Cloudflare bindings enabled:

```sh
npx wrangler pages dev .vercel/output/static
```

The Pages command expects the Next.js-on-Pages build output at `.vercel/output/static`.

### D1 Migrations and SQL

Generate migrations from `src/db/schema.ts` and apply them to local D1:

```sh
npx drizzle-kit generate
npx wrangler d1 migrations apply DB --local
```

Execute a SQL file or a one-off statement directly against local D1:

```sh
npx wrangler d1 execute DB --local --file=./drizzle/seed.sql
npx wrangler d1 execute DB --local --command "SELECT id, title FROM documents;"
```

Use `--remote` only when you intend to target the Cloudflare database.

### Production Deployment

After building the Next.js-on-Pages output and configuring the production bindings and secrets:

```sh
npx wrangler pages deploy .vercel/output/static --project-name=edgenote
```

## Repository Layout

```text
app/
	api/                 App Router API routes (AI summarize, search, upload)
components/
	Editor.tsx           Collaborative Markdown editor
docs/
	getting-started.md   Cloudflare resource and environment setup
	api-routes.md        API contracts and examples
	architecture-realtime.md
	database-schema.md
	components.md
drizzle/               Generated SQL migrations and optional seed SQL
src/
	db/schema.ts         Drizzle SQLite/D1 schema
	document-session.ts  Durable Object document room
wrangler.toml          Cloudflare Pages bindings and Durable Object migration
drizzle.config.ts      Drizzle Kit D1 configuration
.env.example           Local, non-secret environment variable template
```

`drizzle/` is generated when Drizzle Kit creates migrations. This repository currently has no `package.json`; the `npm run` commands require the app dependencies and scripts to be added. For real-time sync, the deployment also needs to route WebSocket upgrades to the `DocumentSession` Durable Object as described in [the real-time architecture guide](docs/architecture-realtime.md).
