import { createRouter, createWebHistory } from "vue-router";
import { useAuth } from "./lib/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/home" },
    { path: "/login", component: () => import("./pages/auth/LoginPage.vue") },
    { path: "/setup", component: () => import("./pages/setup/SetupPage.vue") },

    { path: "/home", component: () => import("./pages/home/DashboardPage.vue") },
    { path: "/data/:slug", component: () => import("./pages/app/RowListPage.vue") },
    { path: "/data/:slug/new", component: () => import("./pages/app/RowEditPage.vue") },
    { path: "/data/:slug/:id", component: () => import("./pages/app/RowDetailPage.vue") },
    { path: "/data/:slug/:id/edit", component: () => import("./pages/app/RowEditPage.vue") },

    {
      path: "/dev",
      component: () => import("./pages/dev/DevLayout.vue"),
      children: [
        { path: "", component: () => import("./pages/dev/TableListPage.vue") },
        { path: "t/:slug", component: () => import("./pages/dev/TableDetailPage.vue"), props: true },
      ],
    },

    { path: "/admin/hierarchy", component: () => import("./pages/admin/HierarchyPage.vue") },
    { path: "/admin/orgs/:id", component: () => import("./pages/admin/OrgDetailPage.vue") },
    { path: "/admin/projects/:id", component: () => import("./pages/admin/ProjectDetailPage.vue") },
    { path: "/admin/users", component: () => import("./pages/admin/UsersPage.vue") },
    { path: "/:orgSlug/tables/:tableSlug/views/:viewSlug", component: () => import("./features/views/ViewPage.vue") },

    // Legacy paths
    { path: "/app", redirect: "/home" },
    { path: "/app/entities/:slug", redirect: (to) => `/data/${to.params.slug}` },
    { path: "/app/entities/:slug/new", redirect: (to) => `/data/${to.params.slug}/new` },
    { path: "/app/entities/:slug/:id/edit", redirect: (to) => `/data/${to.params.slug}/${to.params.id}/edit` },
    { path: "/dev/entities/:slug", redirect: (to) => `/dev/t/${to.params.slug}` },
  ],
});

router.beforeEach(async (to) => {
  let token: string | null = null;
  try {
    token = localStorage.getItem("token");
  } catch {}

  if (to.path === "/login") return token ? "/home" : true;

  // Fresh install heuristic: no orgs yet → run setup first.
  try {
    const res = await fetch("/api/orgs");
    const orgs = await res.json();
    if (Array.isArray(orgs) && orgs.length === 0 && to.path !== "/setup") return "/setup";
  } catch {}

  if (!token) return "/login";

  // Builders (admin/developer) own structure areas; Users page is admin-only.
  const { user, fetchMe } = useAuth();
  const needsBuilder = to.path.startsWith("/dev") || (to.path.startsWith("/admin") && !to.path.startsWith("/admin/users"));
  const needsAdmin = to.path.startsWith("/admin/users");
  if (needsBuilder || needsAdmin) {
    if (!user.value) await fetchMe().catch(() => {});
    const role = user.value?.role;
    if (needsAdmin && role !== "admin") return "/home";
    if (needsBuilder && !(role === "admin" || role === "developer")) return "/home";
  }
  return true;
});

export default router;
