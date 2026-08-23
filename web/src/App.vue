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

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
const orgsQuery = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });

/** Tables grouped by project for the sidebar. */
const groups = computed(() => {
  const entities = entitiesQuery.data.value ?? [];
  const projects = projectsQuery.data.value ?? [];
  return projects
    .map((p) => ({
      project: p,
      org: orgsQuery.data.value?.find((o) => o.id === p.orgId),
      tables: entities.filter((e) => e.projectId === p.id),
    }))
    .filter((g) => g.tables.length > 0);
});

const projectIds = computed(() => new Set((projectsQuery.data.value ?? []).map((p) => p.id)));

/** Organization-wide (and orphaned) tables, grouped per org. */
const orgScoped = computed(() => {
  const entities = entitiesQuery.data.value ?? [];
  return (orgsQuery.data.value ?? [])
    .map((o) => ({
      org: o,
      tables: entities.filter((e) => e.orgId === o.id && (!e.projectId || !projectIds.value.has(e.projectId))),
    }))
    .filter((g) => g.tables.length > 0);
});

const isAdmin = computed(() => user.value?.role === "admin");
const builder = computed(() => isBuilder(user.value?.role));

/** Org shown in the hero: the account's bound organization. */
const myOrg = computed(() =>
  user.value?.orgId ? (orgsQuery.data.value ?? []).find((o) => o.id === user.value!.orgId) : undefined,
);

const navItems = computed(() => {
  const items = [{ to: "/home", label: "Home", active: route.path === "/home" }];
  if (builder.value) {
    items.push(
      { to: "/dev", label: "Dev Studio", active: route.path.startsWith("/dev") },
      { to: "/admin/hierarchy", label: "Hierarchy", active: route.path.startsWith("/admin/orgs") || route.path.startsWith("/admin/projects") || route.path.startsWith("/admin/hierarchy") },
    );
  }
  if (isAdmin.value) {
    items.push({ to: "/admin/users", label: "Users", active: route.path.startsWith("/admin/users") });
  }
  return items;
});

function handleLogout() {
  logout();
  router.push("/login");
}
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <aside class="flex w-60 shrink-0 flex-col border-r bg-muted/40">
      <RouterLink to="/home" class="flex items-center gap-2 border-b px-4 py-4">
        <div class="flex size-7 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">N</div>
        <span class="font-semibold tracking-tight">NanoBlissCRM</span>
      </RouterLink>

      <nav class="flex flex-col gap-0.5 px-2 py-2">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">
          <Button :variant="item.active ? 'secondary' : 'ghost'" size="sm" class="w-full justify-start font-normal" as-child>
            <span>{{ item.label }}</span>
          </Button>
        </RouterLink>
      </nav>

      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <p class="px-2 pb-1 pt-3 text-xs font-medium uppercase text-muted-foreground">Tables</p>
        <template v-if="groups.length > 0 || orgScoped.length > 0">
          <div v-for="g in orgScoped" :key="`org-${g.org.id}`" class="mb-2">
            <div class="truncate px-2 py-1 text-xs text-muted-foreground">
              {{ g.org.name }} · Organization-wide
            </div>
            <RouterLink v-for="e in g.tables" :key="e.id" :to="`/data/${e.slug}`">
              <Button
                :variant="route.params.slug === e.slug && route.path.startsWith('/data') ? 'secondary' : 'ghost'"
                size="sm"
                class="w-full justify-start font-normal"
                as-child
              >
                <span class="truncate">{{ e.label }}</span>
              </Button>
            </RouterLink>
          </div>
          <div v-for="g in groups" :key="g.project.id" class="mb-2">
            <div class="truncate px-2 py-1 text-xs text-muted-foreground">
              {{ g.org?.name ?? "Org" }} › {{ g.project.name }}
            </div>
            <RouterLink v-for="e in g.tables" :key="e.id" :to="`/data/${e.slug}`">
              <Button
                :variant="route.params.slug === e.slug && route.path.startsWith('/data') ? 'secondary' : 'ghost'"
                size="sm"
                class="w-full justify-start font-normal"
                as-child
              >
                <span class="truncate">{{ e.label }}</span>
              </Button>
            </RouterLink>
          </div>
        </template>
        <p v-else class="px-2 py-1 text-sm text-muted-foreground">
          No tables yet — create one in
          <RouterLink to="/dev" class="underline">Dev Studio</RouterLink>.
        </p>
      </div>

      <div class="border-t p-2">
        <template v-if="user">
          <div class="flex items-center gap-2 px-2 py-1.5">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              {{ initials(user.displayName) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ user.displayName }}</div>
              <Badge variant="outline" class="h-4 px-1 text-[10px] uppercase">{{ user.role }}</Badge>
            </div>
          </div>
          <Button variant="ghost" size="sm" class="w-full justify-start font-normal text-muted-foreground" @click="handleLogout">
            Log out
          </Button>
        </template>
        <RouterLink v-else to="/login">
          <Button variant="outline" size="sm" class="w-full">Sign in</Button>
        </RouterLink>
      </div>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <!-- Hero header: org identity + current user -->
      <header class="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-5">
        <template v-if="myOrg">
          <div class="flex size-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
            {{ initials(myOrg.name) }}
          </div>
          <div class="leading-tight">
            <div class="text-sm font-semibold">{{ myOrg.name }}</div>
            <div class="text-[11px] text-muted-foreground">Organization</div>
          </div>
          <div class="mx-2 h-6 w-px bg-border"></div>
        </template>
        <span v-else class="text-sm text-muted-foreground">No organization</span>

        <div class="ml-auto flex items-center gap-3" v-if="user">
          <div class="text-right leading-tight">
            <div class="text-sm font-medium">{{ user.displayName }}</div>
            <Badge variant="outline" class="h-4 px-1 text-[10px] uppercase">{{ user.role }}</Badge>
          </div>
          <div class="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-medium">
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
