# Sync Architecture

## Runtime Shape

- Web target runs SvelteKit with `adapter-node`, SSR/API and `/besmir` as base path.
- Desktop target runs Tauri with a static SvelteKit build, empty base path and local SQLite.
- Shared planning rules live in `src/lib/domain/planner.ts`.
- Sync rules live in `src/lib/sync/*` and are used by both server and desktop-facing code.

## Server API

- `POST /sync/push` accepts local mutations with `op_id`, `device_id`, `version_hlc`, changed fields and per-field clocks.
- `POST /sync/pull` accepts `{ device_id, cursor, limit }`; `cursor: null` returns an initial snapshot, later cursors return event deltas.
- `GET /sync/conflicts?status=open` lists conflicts.
- `PATCH /sync/conflicts` resolves or ignores a conflict with `{ id, status, chosen_fields }`.

Production sync requires `SYNC_API_TOKEN` and `DATABASE_URL`. Without `DATABASE_URL`, the route uses an in-memory store for local development only.

## Merge Rules

- Default merge is Last Write Wins per field via Hybrid Logical Clock.
- Server-owned fields are ignored from client writes: `user_id`, `tenant_id`, `created_by`, `server_seq`.
- Tombstones beat stale updates unless the operation is an explicit `restore`.
- Exact HLC ties are resolved deterministically by `device_id` and written to the conflict log.

## Migrations

- PostgreSQL DDL starts at `drizzle/0000_initial_sync.sql`.
- Tauri SQLite migration v1 is embedded in `src-tauri/src/lib.rs`.
- SQLite stores `schema_migrations`, `device_state`, planning tables, `sync_outbox`, `sync_cursor` and `sync_conflicts`.
- The Tauri layer stores a generated SQLite key in the Windows Credential Store and applies `PRAGMA key` before migrations. Real at-rest DB encryption requires building SQLite with SQLCipher support; plain SQLite treats that pragma as a no-op.

## Release Commands

- Web: `pnpm check && pnpm test && pnpm build:web`
- Desktop: `pnpm check && pnpm test && pnpm tauri:build`
- DB schema generation: `pnpm db:generate`
