# OpenNano CRM

OpenNano CRM is a self-hostable, metadata-driven CRM built around a strict hierarchy:

```text
Organization -> Project -> Table -> Column -> Record
                         \-> Report -> Layout blocks
```

Organizations are the top-level tenant boundary. Projects belong to organizations,
tables belong to projects, and every dynamic table is physically stored inside its
own organization's PostgreSQL schema. Reports belong to projects and can combine
fields from tables in the same organization.

## What It Does

- Provides a regular CRM workspace for working with records.
- Provides a separate Dev Studio for developers and administrators.
- Creates real PostgreSQL tables and columns from table and field metadata.
- Supports field types including text, number, decimal, boolean, date, datetime,
  email, phone, URL, location, select, and relation.
- Allows developers to rename fields, change types, edit select values, change
  visibility, configure relations, and delete fields.
- Renders forms and record detail pages from table metadata.
- Supports organization, project, table, column, and record hierarchy validation.
- Provides project reports built from fields across the organization's tables.
- Provides drag-and-drop report layouts with field blocks, headings, spacers, and
  full, half, or third-width fields.
- Supports browser print preview and PDF downloads for reports and records.

## Modes

### CRM Workspace

Regular users work in the CRM workspace. The sidebar shows the projects and tables
available to them, and table pages provide record list, create, edit, and detail
views.

### Dev Studio

Developers and administrators can switch to Dev Studio to manage structure:

- Create project-scoped tables.
- Add and edit columns.
- Configure select values and relations.
- Change table permissions.
- Build project reports.
- Manage organizations and projects.

The UI does not allow organization-level tables. A table must have both an owning
organization and a project, and the database enforces that the project belongs to
the same organization.

## Reports

Reports are owned by a project:

```text
Organization
  Project
    Report
      Field blocks from tables in the organization
```

To create a report:

1. Open a project in the hierarchy administration page.
2. Select **New report**.
3. Choose fields from the available organization tables.
4. Drag blocks to reorder them, or click fields to add them.
5. Set field widths, add headings or spacers, and configure the report title.
6. Save the report.

Saved reports have a view-only route for regular users and a developer editing route.
Both support print preview. Saved reports can also be downloaded as PDF files.

## Stack

Bun, Hono, PostgreSQL 16, Drizzle ORM, Drizzle Kit, Zod, Vue 3, Vite,
Tailwind CSS v4, shadcn-vue, and TanStack Vue Query.

## Run With Docker

```bash
docker compose up --build
```

Open <http://localhost:3000>.

On a fresh database, register the first account from the login page. The first
account becomes an administrator. If there are no organizations, the application
routes to setup so the first organization and project can be created before tables
are declared.

The app container waits for PostgreSQL, applies Drizzle migrations on startup, and
serves both the API and the built Vue application.

### Reset Local Data

This removes the PostgreSQL volume and all local CRM data:

```bash
docker compose down -v
docker compose up --build
```

### Local Development

Run PostgreSQL in Docker and the application locally:

```bash
docker compose up db
cp .env.example .env
bun install
bun run dev
```

Run the Vue development server separately when needed:

```bash
cd web
bun install
bun run dev
```

Useful commands:

```bash
bun run build:web       # Type-check and build the Vue app
bun run lint            # TypeScript check for the backend
bun run lint:web        # Vue TypeScript check
bun run db:generate     # Generate a Drizzle migration
bun run db:migrate      # Apply migrations
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Hono server port, default `3000` |

See `.env.example` for a local PostgreSQL connection string.

## API Surface

All application APIs use `/api`. Authentication is handled with bearer tokens
returned by registration or login. Structure mutations require a developer or
administrator role.

### Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Sign in, optionally selecting an organization |
| GET | `/api/auth/me` | Return the current account |
| POST | `/api/auth/logout` | End the current session |

### Hierarchy

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/organizations` | List organizations |
| POST | `/api/organizations` | Create an organization |
| GET | `/api/organizations/:id/projects` | List projects in an organization |
| POST | `/api/organizations/:id/projects` | Create a project in an organization |
| GET | `/api/projects` | List projects |
| GET | `/api/projects/:id` | Get a project and its tables |
| GET | `/api/hierarchy` | Return organizations, projects, tables, columns, and reports |

### Tables and Columns

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/organizations/:orgSlug/tables` | List project-scoped tables and columns |
| POST | `/api/organizations/:orgSlug/tables` | Create a table under a project |
| GET | `/api/organizations/:orgSlug/tables/:tableSlug` | Get table metadata |
| DELETE | `/api/organizations/:orgSlug/tables/:tableSlug` | Delete an empty table |
| POST | `/api/organizations/:orgSlug/tables/:tableSlug/fields` | Add a column |
| POST | `/api/dev/entities/:orgSlug/:tableSlug/columns` | Add a developer column |
| PATCH | `/api/dev/entities/:orgSlug/:tableSlug/columns/:name` | Edit a column |
| DELETE | `/api/dev/entities/:orgSlug/:tableSlug/columns/:name` | Delete a column |

Field type changes alter the physical PostgreSQL column and recast existing values.
Invalid casts return a client error and do not update the metadata registry.

### Records

Generic record APIs are scoped by organization and table:

```text
GET    /api/data/:orgSlug/:tableSlug
POST   /api/data/:orgSlug/:tableSlug
GET    /api/data/:orgSlug/:tableSlug/:id
PUT    /api/data/:orgSlug/:tableSlug/:id
DELETE /api/data/:orgSlug/:tableSlug/:id
```

Canonical hierarchical aliases are also available under:

```text
/api/organizations/:orgSlug/tables/:tableSlug/records
```

### Reports

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/projects/:projectId/reports` | List project reports |
| POST | `/api/projects/:projectId/reports` | Create a report layout |
| GET | `/api/projects/:projectId/reports/:reportId` | Get a report |
| PATCH | `/api/projects/:projectId/reports/:reportId` | Update a report layout |
| DELETE | `/api/projects/:projectId/reports/:reportId` | Delete a report |
| POST | `/api/projects/:projectId/reports/:reportId/pdf` | Download a report PDF |

## Data and Schema Design

Fixed metadata is stored in PostgreSQL and versioned with Drizzle migrations:

- `organizations`
- `projects`
- `tables`
- `columns`
- `column_options`
- `reports`
- `views`
- `users`
- `activities`

Dynamic CRM data is stored in a PostgreSQL schema named after the organization slug.
For example:

```text
acme.companies
acme.contacts
acme.deals
```

All dynamic identifiers are validated against `^[a-z][a-z0-9_]*$` before being used
in SQL. Metadata writes happen after successful DDL, with cleanup on failure.

## Project Layout

```text
src/
  app.ts                         Hono application and route mounting
  db/schema.ts                   Drizzle metadata schema
  lib/dynamic-sql.ts             Safe dynamic DDL and DML helpers
  lib/meta-schema.ts             Runtime record validation
  modules/entities/              Table metadata services
  modules/fields/                Column creation service
  modules/records/               Record routes and PDF rendering
  modules/reports/               Project report API
  modules/tables/                Hierarchical table API
  modules/views/                 Table view API
  routes/auth.ts                 Authentication API
  routes/dev.ts                  Developer table and column API
  routes/orgs.ts                 Organization and project API
web/src/
  App.vue                        CRM and Dev Studio application shell
  pages/app/                     Regular record views
  pages/dev/                     Developer table and schema views
  pages/reports/                 Drag-and-drop report editor
  pages/admin/                   Organization and project administration
  components/DynamicForm.vue     Metadata-driven record form
```

## Known Limitations

- Record lists are currently capped at 200 rows and do not yet provide full
  pagination, filtering, or server-side sorting.
- Report layouts currently define printable document structure and selected fields;
  advanced aggregation and multi-record report queries are not yet implemented.
- PDF generation uses Puppeteer when available and a text-oriented `pdf-lib` fallback
  in minimal environments.
- Dynamic tables and columns are PostgreSQL-backed and should be tested with a
  database backup strategy before production use.

## License

MIT. See [LICENSE](LICENSE).
