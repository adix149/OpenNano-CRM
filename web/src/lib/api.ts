export type FieldType =
  | "text"
  | "number"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "url"
  | "location"
  | "select"
  | "relation";

export interface EntityField {
  id: number;
  entityId: number;
  name: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  sortOrder: number;
  createdAt: string;
  options?: string[];
  relationEntityId?: number | null;
  /** Column of the target table used as the linking/display key. */
  relationFieldName?: string | null;
  /** Whether this field appears on the record detail page. */
  inDetail?: boolean;
}

export interface Entity {
  id: number;
  slug: string;
  label: string;
  /** Owning org — its Postgres schema physically stores this table. */
  orgId: number;
  /** Org slug = Postgres schema name; part of every table API path. */
  orgSlug?: string;
  /** NULL = organization-wide scope; set = nested under a project. */
  projectId?: number | null;
  /** Minimum persona required to view / edit records of this table. */
  viewRole?: string;
  editRole?: string;
  createdAt: string;
  fields: EntityField[];
}

export interface Org {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  defaultViewRole?: string;
  defaultEditRole?: string;
  createdAt: string;
  projects?: Project[];
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  orgId: number;
  createdAt: string;
  entities?: Entity[];
}

export type Persona = "admin" | "developer" | "editor" | "viewer" | "member";

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Persona;
  orgId?: number | null;
  createdAt: string;
}

export type Row = Record<string, unknown> & { id: number; created_at: string };

function getToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options?.headers as Record<string, string> | undefined) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    const body = await res.json().catch(() => null);
    if (body?.error) {
      message = body.error;
      if (body.details) message += ` — ${JSON.stringify(body.details)}`;
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  // Hierarchy
  listOrgs: () => request<Org[]>("/api/orgs"),
  getOrg: (id: number) => request<Org>(`/api/orgs/${id}`),
  createOrg: (data: { slug: string; name: string; description?: string }) => request<Org>("/api/orgs", json("POST", data)),
  updateOrg: (id: number, data: Partial<Org>) => request<Org>(`/api/orgs/${id}`, json("PATCH", data)),
  deleteOrg: (id: number) => request<void>(`/api/orgs/${id}`, { method: "DELETE" }),
  listProjects: () => request<Project[]>("/api/projects"),
  listOrgProjects: (orgId: number) => request<Project[]>(`/api/orgs/${orgId}/projects`),
  createProject: (orgId: number, data: { slug: string; name: string; description?: string }) =>
    request<Project>(`/api/orgs/${orgId}/projects`, json("POST", data)),
  getProject: (id: number) => request<Project>(`/api/projects/${id}`),
  updateProject: (id: number, data: Partial<Project>) => request<Project>(`/api/projects/${id}`, json("PATCH", data)),
  deleteProject: (id: number) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  getHierarchy: () => request<{ orgs: Org[]; projects: Project[]; entities: Entity[]; fields: any[] }>("/api/hierarchy"),

  // Auth
  register: (data: { username: string; password: string; displayName: string; role?: string; orgSlug?: string }) =>
    request<{ token: string; id: number; username: string; displayName: string; role: string }>("/api/auth/register", json("POST", data)),
  login: (data: { username: string; password: string; orgSlug?: string }) =>
    request<{ token: string; id: number; username: string; displayName: string; role: string }>("/api/auth/login", json("POST", data)),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),

  // Users (admin)
  listUsers: () => request<User[]>("/api/users"),
  createUser: (data: { username: string; password: string; displayName: string; role?: string; orgId?: number }) =>
    request<User>("/api/users", json("POST", data)),
  updateUser: (id: number, data: { displayName?: string; password?: string; role?: string; orgId?: number | null }) =>
    request<User>(`/api/users/${id}`, json("PATCH", data)),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: "DELETE" }),

  // Dev API — entity paths are hierarchical: /api/dev/entities/:org/:slug
  listEntities: () => request<Entity[]>("/api/dev/entities"),
  createEntity: (
    slug: string,
    label: string,
    scope: { orgId?: number; projectId?: number },
  ) => request<Entity>("/api/dev/entities", json("POST", { slug, label, ...scope })),
  deleteEntity: (orgSlug: string, slug: string) => request<void>(`/api/dev/entities/${orgSlug}/${slug}`, { method: "DELETE" }),
  addField: (
    orgSlug: string,
    slug: string,
    field: { name: string; label: string; type: FieldType; is_required: boolean; in_detail?: boolean; options?: string[]; relationEntitySlug?: string; relationEntityId?: number; relationFieldName?: string },
  ) => request<EntityField>(`/api/dev/entities/${orgSlug}/${slug}/fields`, json("POST", field)),
  updateField: (
    orgSlug: string,
    slug: string,
    fieldName: string,
    patch: { name?: string; label?: string; type?: FieldType; is_required?: boolean; in_detail?: boolean; options?: string[]; relationEntitySlug?: string; relationEntityId?: number; relationFieldName?: string },
  ) => request<EntityField>(`/api/dev/entities/${orgSlug}/${slug}/fields/${fieldName}`, json("PATCH", patch)),
  deleteField: (orgSlug: string, slug: string, fieldName: string, reassignTo?: string) =>
    request<void>(
      `/api/dev/entities/${orgSlug}/${slug}/fields/${fieldName}${reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : ""}`,
      { method: "DELETE" },
    ),
  updateEntity: (orgSlug: string, slug: string, patch: { slug?: string; label?: string; viewRole?: string; editRole?: string }) =>
    request<Entity>(`/api/dev/entities/${orgSlug}/${slug}`, json("PATCH", patch)),

  // Generic data API — same hierarchy: /api/data/:org/:slug
  listRows: (orgSlug: string, slug: string) => request<Row[]>(`/api/data/${orgSlug}/${slug}`),
  getRow: (orgSlug: string, slug: string, id: number) => request<Row>(`/api/data/${orgSlug}/${slug}/${id}`),
  createRow: (orgSlug: string, slug: string, payload: Record<string, unknown>) => request<Row>(`/api/data/${orgSlug}/${slug}`, json("POST", payload)),
  updateRow: (orgSlug: string, slug: string, id: number, payload: Record<string, unknown>) =>
    request<Row>(`/api/data/${orgSlug}/${slug}/${id}`, json("PUT", payload)),
  deleteRow: (orgSlug: string, slug: string, id: number) => request<void>(`/api/data/${orgSlug}/${slug}/${id}`, { method: "DELETE" }),
  lookup: (orgSlug: string, slug: string, search?: string, limit?: number, display?: string) =>
    request<{ id: number; label: string }[]>(
      `/api/data/${orgSlug}/${slug}/lookup?search=${encodeURIComponent(search ?? "")}&limit=${limit ?? 20}${display ? `&display=${encodeURIComponent(display)}` : ""}`,
    ),

  // Hierarchical v0.1 — canonical
  listTables: (orgSlug: string) => request<Entity[]>(`/api/organizations/${orgSlug}/tables`),
  createTable: (orgSlug: string, data: { slug: string; label: string; projectId?: number; viewRole?: string; editRole?: string }) =>
    request<Entity>(`/api/organizations/${orgSlug}/tables`, json("POST", data)),
  getTable: (orgSlug: string, slug: string) => request<Entity>(`/api/organizations/${orgSlug}/tables/${slug}`),

  // Views
  listViews: (orgSlug: string, tableSlug: string) => request<any[]>(`/api/organizations/${orgSlug}/tables/${tableSlug}/views`),
  createView: (orgSlug: string, tableSlug: string, data: { slug: string; label: string; kind: string; layout: any; config?: any }) =>
    request<any>(`/api/organizations/${orgSlug}/tables/${tableSlug}/views`, json("POST", data)),
  getView: (orgSlug: string, tableSlug: string, viewSlug: string) =>
    request<any>(`/api/organizations/${orgSlug}/tables/${tableSlug}/views/${viewSlug}`),
  updateView: (orgSlug: string, tableSlug: string, viewSlug: string, patch: any) =>
    request<any>(`/api/organizations/${orgSlug}/tables/${tableSlug}/views/${viewSlug}`, json("PATCH", patch)),
  deleteView: (orgSlug: string, tableSlug: string, viewSlug: string) =>
    request<void>(`/api/organizations/${orgSlug}/tables/${tableSlug}/views/${viewSlug}`, { method: "DELETE" }),
  viewPdf: (orgSlug: string, tableSlug: string, viewSlug: string, recordId: number) =>
    request<Blob>(`/api/organizations/${orgSlug}/tables/${tableSlug}/views/${viewSlug}/pdf?recordId=${recordId}`, {}),

  // Hierarchical records (aliases to /api/data for now)
  listRecords: (orgSlug: string, tableSlug: string) => request<Row[]>(`/api/organizations/${orgSlug}/tables/${tableSlug}/records`),
  createRecord: (orgSlug: string, tableSlug: string, payload: Record<string, unknown>) =>
    request<Row>(`/api/organizations/${orgSlug}/tables/${tableSlug}/records`, json("POST", payload)),
};
