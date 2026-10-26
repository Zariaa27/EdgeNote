# Developer Guide

This guide is the entry point for contributors. Use the focused docs below for implementation details and keep source-level JSDoc close to exported TypeScript APIs so editor hover and completion expose it where developers work.

## Documentation Map

| Area | Reference |
| --- | --- |
| Local setup, Cloudflare bindings, migrations, and deploy | [Getting Started](getting-started.md) |
| Routed reply address and transactional sender setup | [Email Setup](email-setup.md) |
| HTTP endpoints and request/response contracts | [API Routes](api-routes.md) |
| Drizzle schema and D1 tables | [Database Schema](database-schema.md) |
| Shared UI components | [Components](components.md) |
| Durable Object WebSocket protocol | [Real-Time Collaboration Architecture](architecture-realtime.md) |

The main runtime areas are `app/` (pages and App Router endpoints), `components/` (client and shared UI), and `src/` (server helpers, database schema, and the Durable Object). `worker.ts` and `wrangler.toml` describe the Cloudflare Worker entry point and bindings.

## JSDoc Conventions

- Add JSDoc to exported server helpers, types, constants, and route handlers when their behavior or contract is not obvious from the name and TypeScript type.
- Document parameters, units, return values, side effects, and failure behavior when those details affect callers. Keep comments factual and update them with behavior changes.
- Prefer meaningful TypeScript types over duplicating type declarations in JSDoc. Use JSDoc tags such as `@param`, `@returns`, and `@throws` when they clarify API usage in editor IntelliSense.
- Keep HTTP request and response examples in `docs/api-routes.md`; keep infrastructure setup in `docs/getting-started.md` or a focused guide rather than embedding long instructions in source comments.
- Do not document secrets with real values. Only reference binding names and the secret-management mechanism.

The account email and session/password helpers in `src/server/account-email.ts` and `src/server/auth.ts` include JSDoc on their exported APIs. Read these comments in the editor by hovering over an imported symbol or using Go to Definition.

## Change Checklist

1. Find the endpoint/component entry point and its server-side helper before changing behavior.
2. Update the API contract or focused guide when a public route, binding, environment variable, or failure behavior changes.
3. Keep Cloudflare environment-specific values out of source control; local Worker bindings belong in ignored `.dev.vars`.
4. Run `npm run typecheck` and the narrowest relevant validation command before opening a pull request.
