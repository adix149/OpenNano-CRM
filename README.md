# OpenNano CRM

A lightweight, self-hostable CRM with a **runtime-configurable schema**. Developers declare
entities and fields in the `/dev` view; declarations issue real Postgres DDL
(`CREATE TABLE` / `ALTER TABLE`) tracked by a metadata registry. The end-user view at `/app`
renders generic list/create/edit/delete screens driven entirely by that registry.

Fields are fully editable after creation: rename columns, change types (data is re-cast),
toggle required, relabel, or delete fields outright. Entities can be retitled or reslugged
(reslug renames the underlying table).

## Stack

Bun · Hono · PostgreSQL 16 · Drizzle ORM (`drizzle-orm/bun-sql` driver) · drizzle-kit ·
Zod · Vue 3 (Composition API) · Vite · shadcn-vue · Tailwind CSS v4 ·
@tanstack/vue-query · vee-validate · @internationalized/date (Apache-2.0)

## Run it

```bash
docker compose up --build
```

Then open:

- **User view:** http://localhost:3000/app
- **Developer view:** http://localhost:3000/dev

The app container waits for the Postgres healthcheck, applies Drizzle migrations
automatically on boot, then starts Hono serving both the API (`/api/*`) and the built
Vue SPA.

### Local development (without Docker for the app)

```bash
docker compose up db          # Postgres only
cp .env.example .env
bun install
bun run dev                   # API on :3000 with hot reload
cd web && bun install && bun run dev   # Vite dev server with /api proxy
```

### Environment

| Var            | Purpose                          |
| -------------- | -------------------------------- |
| `DATABASE_URL` | Postgres connection string       |
| `PORT`         | Port the app listens on (3000)   |

## How migrations work

Two kinds of schema changes exist:

1. **Fixed metadata tables** (`entities`, `fields`, the `field_type` enum) — versioned
   Drizzle migrations in `drizzle/`. Regenerate with `bun run db:generate`, apply with
   `bun run db:migrate` (or let the app auto-migrate on boot).
2. **Dynamic data tables** — created *and later altered* at runtime through
   `src/lib/dynamic-sql.ts`, which strictly allowlists every identifier
   (`^[a-z][a-z0-9_]*$`) before interpolation. Metadata rows are written only after DDL
   succeeds, with compensating cleanup on failure, so the registry and Postgres never
   diverge. Impossible type casts surface Postgres's error as a 400 and leave both sides
   untouched.

### Example flow

```bash
curl -X POST localhost:3000/api/dev/entities -H 'Content-Type: application/json' \
     -d '{"slug":"contacts","label":"Contacts"}'
curl -X POST localhost:3000/api/dev/entities/contacts/fields -H 'Content-Type: application/json' \
     -d '{"name":"full_name","label":"Full Name","type":"text","is_required":true}'
curl -XPATCH localhost:3000/api/dev/entities/contacts/fields/full_name -H 'Content-Type: application/json' \
     -d '{"type":"number"}'
docker compose exec db psql -U nanobliss -d nanobliss -c '\d contacts'
```

## API surface

Dev/config (`/api/dev`, unauthenticated):

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST   | `/entities` | Create entity + table |
| GET    | `/entities` | List entities with fields |
| PATCH  | `/entities/:slug` | Rename/retitle entity (reslug renames table) |
| DELETE | `/entities/:slug` | Drop entity (only if zero rows) |
| POST   | `/entities/:slug/fields` | Add field/column |
| PATCH  | `/entities/:slug/fields/:name` | Edit field (rename column, re-cast type, label, required) |
| DELETE | `/entities/:slug/fields/:name` | Delete field (drops column + its data) |

Data (`/api/data`, generic): `GET/POST /:slug`, `GET/PUT/DELETE /:slug/:id`.

## Project layout

```
src/                 Hono backend (Bun)
  db/schema.ts         entities + fields metadata tables (Drizzle)
  lib/dynamic-sql.ts   ALL dynamic identifier validation + SQL building
  lib/meta-schema.ts   zod schemas built from field metadata
  routes/dev.ts        dev/config API
  routes/data.ts       generic CRUD API
web/                 Vue 3 + Vite frontend
  src/components/DynamicForm.vue   shared metadata-driven form
  src/components/DateTimeField.vue calendar/time picker
  src/pages/dev/…                  developer view
  src/pages/app/…                  user view
```

## Driver note

`drizzle-orm/bun-sql` chosen over `node-postgres`. Gotchas handled in code:
`db.execute()` returns row arrays directly (not `{ rows }`), NUMERIC reads back as
strings, and JS `Date` objects must not be bound directly (Bun serializes them in a
JS-only format Postgres rejects for DATE columns) — ISO strings are used instead.

## Known limitations

- **List views return at most 200 rows**, flat — no pagination/search/filter/sort.
- **Type changes re-cast existing data** via Postgres `USING` casts; impossible casts are
  rejected with the database's error and leave the registry untouched.
- **Dev API is unauthenticated** — do not expose v0 to the public internet.
- Entity deletion still requires an empty table; there is no bulk row clear.

## Deferred to later versions

- **Authentication & sessions** (planned: Lucia + Oslo) — mounting point marked in
  `src/index.ts`.
- **Authorization / roles** (who can access `/dev` vs `/app`).
- **OAuth integrations** (Gmail/Calendar via `arctic` + `googleapis`).
- **Background job processing**.
- **PDF generation / printing**.
- **Field types beyond text/number/boolean/date/datetime** — `select` and `relation`
  remain unimplemented.
- **Pagination, search, filtering, sorting** on list views.
- **Managed Postgres deployment configs** (RDS/Cloud SQL/Azure).

## License

MIT — see [LICENSE](LICENSE).

## Licenses of Dependencies

All dependencies are MIT, Apache-2.0, BSD, ISC, or PostgreSQL-licensed.
