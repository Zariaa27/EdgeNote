# EdgeNote

EdgeNote is an edge-native collaborative Markdown workspace. It combines a lightweight editor with Cloudflare's storage and compute services for document collaboration, AI assistance, semantic discovery, and image attachments.

## Features

- **A welcoming front door:** public landing page and a consistent EdgeNote brand mark.
- **Markdown editor:** focused writing surface with Markdown formatting controls and image insertion.
- **Real-time sync:** document-room WebSockets backed by a Cloudflare Durable Object, with revision acknowledgements for persisted D1 saves.
- **Document sharing:** private by default; owners can create unlisted, read-only public links or grant viewer/editor access by verified email.
- **Document management:** name and choose access while creating notes, permanently delete owned notes, or leave notes shared with your account.
- **Comfortable controls:** persistent light/dark theme and visible sign-out across the workspace.
- **Account controls:** verified email, email-based password recovery, profile/email updates, JSON data export (including uploaded images), and confirmed account deletion.
- **AI summarization:** generate a concise document summary with Workers AI.
- **Semantic search:** embed a query and retrieve related documents from Vectorize.
- **R2 uploads:** store validated image attachments in R2 and keep their metadata in D1.
- **Admin analytics:** account and document activity for the owner account only; API access is checked server-side.

Guests see the public landing page at `/`. An active session is redirected to `/workspace`, so returning users go straight to their documents. The admin dashboard is at `/admin` and its analytics API only authorizes the account `alexistrudeau94@gmail.com`.

## Tech Stack

![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-F38020?logo=cloudflare)
![Workers AI](https://img.shields.io/badge/Cloudflare-Workers%20AI-F38020?logo=cloudflare)
![Vectorize](https://img.shields.io/badge/Cloudflare-Vectorize-F38020?logo=cloudflare)
![Durable Objects](https://img.shields.io/badge/Cloudflare-Durable%20Objects-F38020?logo=cloudflare)

Next.js 15 App Router and React provide the application UI and API routes. Drizzle ORM defines the SQLite schema and D1 access. OpenNext deploys the app as a Cloudflare Worker, with D1 for relational document data, R2 for files, Workers AI for inference, Vectorize for embeddings, and Durable Objects for collaborative document rooms.

## Quickstart

See [Getting Started](docs/getting-started.md) for prerequisites, Cloudflare resource creation, local bindings, and environment setup.

```sh
npm ci
cp .env.example .env.local
npx wrangler login
```

Complete the resource IDs, local secrets, and database migration in [Getting Started](docs/getting-started.md) before running `npm run dev`. The Next.js dev server uses OpenNext's Cloudflare proxy and requires Wrangler authentication. The Next.js server does not emulate Cloudflare services; use `npm run preview` to validate the production Worker locally. Never commit credentials.

## Command Cheat-Sheet

### Local Development

```sh
npm run dev
```

Use the Next.js dev server for UI development. To build and run the production Worker locally with Cloudflare bindings:

```sh
npm run preview
```

`preview` builds the OpenNext Worker and starts it in Wrangler's local runtime.

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

After configuring the production bindings, applying reviewed migrations, and adding the required Worker secrets:

```sh
npm run deploy
```

This deploys the Worker configured in `wrangler.toml`; it does not deploy a Cloudflare Pages project.

## Repository Layout

```text
app/
	api/                 App Router API routes (auth, admin, AI, search, upload)
	admin/               Restricted analytics dashboard
	workspace/           Signed-in workspace
components/
	BrandMark.tsx        Shared EdgeNote logo mark
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
wrangler.toml          Cloudflare Worker bindings and Durable Object migration
worker.ts              OpenNext Worker and Durable Object entrypoint
drizzle.config.ts      Drizzle Kit D1 configuration
.env.example           Local, non-secret environment variable template
```

`drizzle/` contains the reviewed D1 migrations. The OpenNext Worker exports the `DocumentSession` Durable Object, and `/api/realtime` routes authenticated WebSocket upgrades to the document room described in [the real-time architecture guide](docs/architecture-realtime.md).
