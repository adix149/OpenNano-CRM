<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/lib/api";
import { slugify } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const router = useRouter();
const step = ref<1 | 2>(1);
const orgSlug = ref("");
const orgName = ref("");
const orgDesc = ref("");
const projSlug = ref("");
const projName = ref("");
const projDesc = ref("");
const error = ref("");
const orgId = ref<number | null>(null);
const orgSlugTouched = ref(false);
const projSlugTouched = ref(false);

onMounted(async () => {
  try {
    const orgs = await api.listOrgs();
    if (orgs.length > 0) {
      orgId.value = orgs[0].id;
      step.value = 2;
    }
  } catch {}
});

function onOrgName() {
  if (!orgSlugTouched.value) orgSlug.value = slugify(orgName.value);
}
function onProjName() {
  if (!projSlugTouched.value) projSlug.value = slugify(projName.value);
}

async function createOrg() {
  error.value = "";
  if (!orgSlug.value || !orgName.value) {
    error.value = "Name and slug are required";
    return;
  }
  try {
    const org = await api.createOrg({ slug: orgSlug.value, name: orgName.value, description: orgDesc.value });
    orgId.value = org.id;
    step.value = 2;
  } catch (e: any) {
    error.value = e.message;
  }
}

async function createProject() {
  error.value = "";
  if (!projSlug.value || !projName.value || !orgId.value) {
    error.value = "Project name and slug are required";
    return;
  }
  try {
    await api.createProject(orgId.value, { slug: projSlug.value, name: projName.value, description: projDesc.value });
    router.push("/dev");
  } catch (e: any) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6 py-8">
    <div class="text-center">
      <h1 class="text-2xl font-bold">Set up your workspace</h1>
      <p class="text-sm text-muted-foreground">Organization → Project → Tables. You can change all of this later.</p>
    </div>

    <div class="flex items-center justify-center gap-2 text-sm">
      <span :class="step >= 1 ? 'font-medium text-foreground' : 'text-muted-foreground'">1. Organization</span>
      <span class="text-muted-foreground">→</span>
      <span :class="step >= 2 ? 'font-medium text-foreground' : 'text-muted-foreground'">2. Project</span>
    </div>

    <Card v-if="step === 1">
      <CardHeader>
        <CardTitle>Create Organization</CardTitle>
        <CardDescription>The top-level tenant, e.g. your company.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <div class="space-y-2">
          <Label>Name</Label>
          <Input v-model="orgName" placeholder="Acme Corp" @input="onOrgName" />
        </div>
        <div class="space-y-2">
          <Label>Slug</Label>
          <Input v-model="orgSlug" placeholder="acme" @input="orgSlugTouched = true" />
        </div>
        <div class="space-y-2">
          <Label>Description</Label>
          <Textarea v-model="orgDesc" placeholder="What this organization is for" />
        </div>
        <Button class="w-full" @click="createOrg">Continue →</Button>
      </CardContent>
    </Card>

    <Card v-else>
      <CardHeader>
        <CardTitle>Create Project</CardTitle>
        <CardDescription>A workspace for tables inside the organization.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <div class="space-y-2">
          <Label>Name</Label>
          <Input v-model="projName" placeholder="Sales CRM" @input="onProjName" />
        </div>
        <div class="space-y-2">
          <Label>Slug</Label>
          <Input v-model="projSlug" placeholder="sales" @input="projSlugTouched = true" />
        </div>
        <div class="space-y-2">
          <Label>Description</Label>
          <Textarea v-model="projDesc" placeholder="What this project tracks" />
        </div>
        <Button class="w-full" @click="createProject">Create &amp; open Dev Studio →</Button>
        <Button variant="outline" class="w-full" @click="router.push('/home')">Skip for now</Button>
      </CardContent>
    </Card>
  </div>
</template>
