<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const router = useRouter();
const { login } = useAuth();

const orgsQuery = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });
const orgSlug = ref("");

const mode = ref<"login" | "register">("login");
const username = ref("");
const password = ref("");
const displayName = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  if (!username.value || !password.value) {
    error.value = "Username and password required";
    return;
  }
  loading.value = true;
  try {
    if (mode.value === "register") {
      if (!displayName.value) {
        error.value = "Display name required";
        loading.value = false;
        return;
      }
      await api.register({ username: username.value, password: password.value, displayName: displayName.value, orgSlug: orgSlug.value || undefined });
      await login(username.value, password.value, orgSlug.value || undefined);
    } else {
      await login(username.value, password.value, orgSlug.value || undefined);
    }
    router.push("/app");
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="max-w-md mx-auto mt-10">
    <Card>
      <CardHeader>
        <CardTitle>{{ mode === "login" ? "Sign in" : "Create account" }}</CardTitle>
        <CardDescription>
          {{ mode === "login" ? "Enter your credentials" : "First user becomes admin" }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex gap-2">
          <Button :variant="mode === 'login' ? 'default' : 'outline'" size="sm" @click="mode = 'login'">Login</Button>
          <Button :variant="mode === 'register' ? 'default' : 'outline'" size="sm" @click="mode = 'register'">Register</Button>
        </div>
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <div v-if="orgsQuery.isLoading.value" class="text-sm text-muted-foreground">Loading organizations…</div>
        <div v-else-if="orgsQuery.isError.value" class="text-sm text-destructive">Could not load organizations. Refresh and try again.</div>
        <div v-else-if="(orgsQuery.data.value ?? []).length > 0" class="space-y-2">
          <Label for="org">Organization</Label>
          <select id="org" v-model="orgSlug" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">— Choose your organization —</option>
            <option v-for="o in orgsQuery.data.value ?? []" :key="o.id" :value="o.slug">{{ o.name }}</option>
          </select>
        </div>
        <p v-else class="text-sm text-muted-foreground">
          No organizations yet. <RouterLink to="/setup" class="underline">Start setup</RouterLink>
        </p>
        <div class="space-y-2">
          <Label for="username">Username</Label>
          <Input id="username" v-model="username" placeholder="johndoe" />
        </div>
        <div v-if="mode === 'register'" class="space-y-2">
          <Label for="display">Display name</Label>
          <Input id="display" v-model="displayName" placeholder="John Doe" />
        </div>
        <div class="space-y-2">
          <Label for="password">Password</Label>
          <Input id="password" v-model="password" type="password" />
        </div>
        <Button class="w-full" :disabled="loading" @click="submit">{{ loading ? "..." : mode === "login" ? "Sign in" : "Create account" }}</Button>
      </CardContent>
    </Card>
  </div>
</template>
