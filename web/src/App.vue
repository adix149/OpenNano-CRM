<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { isBuilder } from "@/lib/personas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const route = useRoute();
const router = useRouter();
const { user, logout, fetchMe } = useAuth();

onMounted(() => {
  fetchMe().catch(() => {});
});

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities, enabled: computed(() => Boolean(user.value)) });
const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, enabled: computed(() => Boolean(user.value)) });
const orgsQuery = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs, enabled: computed(() => Boolean(user.value)) });
const hierarchyQuery = useQuery({ queryKey: ["hierarchy"], queryFn: api.getHierarchy, enabled: computed(() => Boolean(user.value)) });

/** Tables grouped by project for the sidebar. */
const groups = computed(() => {
  const entities = entitiesQuery.data.value ?? [];
  const projects = projectsQuery.data.value ?? [];
  return projects
    .map((p) => ({
      project: p,
      org: orgsQuery.data.value?.find((o) => o.id === p.orgId),
      tables: entities.filter((e) => e.projectId === p.id),
      reports: (hierarchyQuery.data.value?.reports ?? []).filter((report) => report.projectId === p.id),
    }))
    .filter((g) => g.tables.length > 0 || g.reports.length > 0);
});

const isAdmin = computed(() => user.value?.role === "admin");
const builder = computed(() => isBuilder(user.value?.role));
const devMode = computed(() => route.path.startsWith("/dev") || route.path.startsWith("/admin"));

/** Org shown in the hero: the account's bound organization. */
const myOrg = computed(() =>
  user.value?.orgId ? (orgsQuery.data.value ?? []).find((o) => o.id === user.value!.orgId) : undefined,
);

const activeEntity = computed(() => {
  const slug = String(route.params.slug ?? "");
  return (entitiesQuery.data.value ?? []).find((entity) => entity.slug === slug);
});

const activeProject = computed(() =>
  (projectsQuery.data.value ?? []).find((project) => project.id === activeEntity.value?.projectId),
);

const activeOrg = computed(() =>
  (orgsQuery.data.value ?? []).find((org) => org.id === (activeProject.value?.orgId ?? activeEntity.value?.orgId ?? user.value?.orgId)),
);

const navItems = computed(() => {
  if (devMode.value && builder.value) {
    return [
      { to: "/dev", label: "Schema overview", active: route.path === "/dev" },
      { to: "/admin/hierarchy", label: "Hierarchy", active: route.path.startsWith("/admin/orgs") || route.path.startsWith("/admin/projects") || route.path === "/admin/hierarchy" },
      ...(isAdmin.value ? [{ to: "/admin/users", label: "People & access", active: route.path.startsWith("/admin/users") }] : []),
    ];
  }
  return [{ to: "/home", label: "Overview", active: route.path === "/home" }];
});

function handleLogout() {
  logout();
  router.push("/login");
}
</script>

<template>
  <div class="app-frame flex h-screen overflow-hidden">
    <aside class="app-sidebar flex w-72 shrink-0 flex-col border-r">
      <div class="border-b p-4">
        <RouterLink to="/home" class="brand flex items-center gap-3">
          <div class="brand-mark">N</div>
          <div>
            <div class="font-semibold tracking-tight">NanoBlissCRM</div>
            <div class="text-[11px] text-muted-foreground">Operations workspace</div>
          </div>
        </RouterLink>
      </div>

      <div class="mode-switch m-3 rounded-xl p-1">
        <RouterLink to="/home" :class="['mode-option', !devMode ? 'mode-option-active' : '']">
          <span class="mode-dot bg-emerald-500"></span> CRM workspace
        </RouterLink>
        <RouterLink v-if="builder" to="/dev" :class="['mode-option', devMode ? 'mode-option-active' : '']">
          <span class="mode-dot bg-violet-500"></span> Dev Studio
        </RouterLink>
      </div>

      <nav class="flex flex-col gap-1 px-3">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link" :class="{ 'nav-link-active': item.active }">
          <span class="nav-glyph">{{ item.label.slice(0, 1) }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div class="mt-6 mb-2 flex items-center justify-between px-2">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{{ devMode ? 'Project schemas' : 'Your workspace' }}</p>
          <span class="text-[10px] text-muted-foreground">{{ groups.length }}</span>
        </div>
        <template v-if="groups.length > 0">
          <div v-for="g in groups" :key="g.project.id" class="project-group mb-3">
            <div class="project-heading">
              <span class="project-icon">{{ g.project.name.slice(0, 1) }}</span>
              <span class="min-w-0 flex-1 truncate">{{ g.project.name }}</span>
              <span class="text-[10px] text-muted-foreground">{{ g.tables.length }}</span>
            </div>
            <RouterLink v-for="e in g.tables" :key="e.id" :to="`/data/${e.slug}`" class="table-link" :class="{ 'table-link-active': route.params.slug === e.slug && route.path.startsWith('/data') }">
              <span class="table-link-line"></span>
              <span class="truncate">{{ e.label }}</span>
            </RouterLink>
            <RouterLink v-for="report in g.reports" :key="`report-${report.id}`" :to="devMode ? `/dev/projects/${g.project.id}/reports/${report.id}` : `/reports/${g.project.id}/${report.id}`" class="table-link report-link" :class="{ 'table-link-active': route.params.reportId === String(report.id) }">
              <span class="table-link-line"></span>
              <span class="truncate">{{ report.label }}</span><span class="report-nav-badge">PDF</span>
            </RouterLink>
          </div>
        </template>
        <div v-else class="empty-sidebar rounded-xl p-3 text-xs text-muted-foreground">
          No project tables yet. <RouterLink v-if="builder" to="/dev" class="font-medium text-foreground underline">Open Dev Studio</RouterLink>
        </div>
      </div>

      <div class="border-t p-3">
        <template v-if="user">
          <div class="user-card flex items-center gap-2 rounded-xl p-2">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {{ initials(user.displayName) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ user.displayName }}</div>
              <div class="text-[10px] uppercase tracking-wide text-muted-foreground">{{ user.role }} access</div>
            </div>
          </div>
          <button class="logout-link mt-1 w-full text-left" @click="handleLogout">Log out</button>
        </template>
        <RouterLink v-else to="/login">
          <Button variant="outline" size="sm" class="w-full">Sign in</Button>
        </RouterLink>
      </div>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header class="workspace-header shrink-0 border-b px-5 py-3">
        <div class="flex items-center gap-3">
          <div class="hierarchy-node hierarchy-org" v-if="activeOrg || myOrg">
            <span class="hierarchy-avatar">{{ initials((activeOrg || myOrg)!.name) }}</span>
            <span class="hidden sm:block"><span class="hierarchy-kicker">Organization</span><span class="hierarchy-name">{{ (activeOrg || myOrg)!.name }}</span></span>
          </div>
          <span v-else class="text-sm text-muted-foreground">No organization selected</span>
          <span v-if="activeProject" class="hierarchy-separator">/</span>
          <div v-if="activeProject" class="hierarchy-node">
            <span class="hierarchy-icon">P</span>
            <span class="hidden sm:block"><span class="hierarchy-kicker">Project</span><span class="hierarchy-name">{{ activeProject.name }}</span></span>
          </div>
          <span v-if="activeEntity" class="hierarchy-separator">/</span>
          <div v-if="activeEntity" class="hierarchy-node hierarchy-current">
            <span class="hierarchy-icon">T</span>
            <span class="hidden sm:block"><span class="hierarchy-kicker">Table</span><span class="hierarchy-name">{{ activeEntity.label }}</span></span>
          </div>
          <div v-if="devMode" class="mode-badge mode-badge-dev">Developer mode</div>
          <div v-else class="mode-badge mode-badge-crm">CRM mode</div>
        </div>
        <div class="ml-auto flex items-center gap-3" v-if="user">
          <div class="text-right leading-tight">
            <div class="text-sm font-medium">{{ user.displayName }}</div>
            <Badge variant="outline" class="h-4 px-1 text-[10px] uppercase">{{ user.role }}</Badge>
          </div>
          <div class="hidden size-9 items-center justify-center rounded-full bg-secondary text-sm font-medium md:flex">
            {{ initials(user.displayName) }}
          </div>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-6xl px-6 py-6">
          <RouterView :key="route.fullPath" />
        </div>
      </div>
    </main>
  </div>
</template>
