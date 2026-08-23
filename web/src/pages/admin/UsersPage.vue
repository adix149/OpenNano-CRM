<script setup lang="ts">
import { ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const queryClient = useQueryClient();
const { user: me } = useAuth();

const usersQ = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: api.listOrgs });

const orgName = (id?: number | null) => (id ? (orgsQ.data.value?.find((o) => o.id === id)?.name ?? `#${id}`) : "—");

// ── Create ──
const username = ref("");
const displayName = ref("");
const password = ref("");
const role = ref("viewer");
const createError = ref("");

const createUser = useMutation({
  mutationFn: () =>
    api.createUser({ username: username.value.trim(), displayName: displayName.value.trim(), password: password.value, role: role.value }),
  onSuccess: async () => {
    createError.value = "";
    username.value = "";
    displayName.value = "";
    password.value = "";
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  },
  onError: (e: any) => (createError.value = e.message),
});

function submitCreate() {
  createError.value = "";
  if (!username.value.trim() || !displayName.value.trim() || password.value.length < 6) {
    createError.value = "All fields are required (password min 6 chars)";
    return;
  }
  createUser.mutate();
}

// ── Edit dialog ──
const editing = ref<User | null>(null);
const editDisplayName = ref("");
const editRole = ref("viewer");
const editOrgId = ref("none");
const editPassword = ref("");
const editError = ref("");

function openEdit(u: User) {
  editing.value = u;
  editDisplayName.value = u.displayName;
  editRole.value = u.role;
  editOrgId.value = u.orgId ? String(u.orgId) : "none";
  editPassword.value = "";
  editError.value = "";
}

const updateUser = useMutation({
  mutationFn: () => {
    const patch: Record<string, unknown> = {};
    const u = editing.value!;
    if (editDisplayName.value !== u.displayName) patch.displayName = editDisplayName.value.trim();
    if (editRole.value !== u.role) patch.role = editRole.value;
    const orgNum = editOrgId.value === "none" ? null : Number(editOrgId.value);
    if (orgNum !== (u.orgId ?? null)) patch.orgId = orgNum;
    if (editPassword.value) patch.password = editPassword.value;
    return api.updateUser(u.id, patch);
  },
  onSuccess: async () => {
    editing.value = null;
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  },
  onError: (e: any) => (editError.value = e.message),
});

function submitEdit() {
  editError.value = "";
  if (!editDisplayName.value.trim()) {
    editError.value = "Display name required";
    return;
  }
  if (editPassword.value && editPassword.value.length < 6) {
    editError.value = "Password must be at least 6 characters";
    return;
  }
  updateUser.mutate();
}

const deleteUser = useMutation({
  mutationFn: (id: number) => api.deleteUser(id),
  onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  onError: (e: any) => (createError.value = e.message),
});
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Users</h1>
      <p class="text-sm text-muted-foreground">Admins manage accounts, roles and organization membership.</p>
    </div>

    <p v-if="createError" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {{ createError }}
    </p>

    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="text-base">All users</CardTitle>
        <CardDescription>{{ (usersQ.data.value ?? []).length }} account(s)</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead class="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="u in usersQ.data.value ?? []" :key="u.id">
                <TableCell>
                  <code>{{ u.username }}</code>
                  <Badge v-if="me && u.id === me.id" variant="outline" class="ml-2 h-4 px-1 text-[10px] uppercase">you</Badge>
                </TableCell>
                <TableCell>{{ u.displayName }}</TableCell>
                <TableCell>
                  <Badge :variant="u.role === 'admin' ? 'default' : 'secondary'">{{ u.role }}</Badge>
                </TableCell>
                <TableCell>{{ orgName(u.orgId) }}</TableCell>
                <TableCell class="text-right">
                  <Button variant="outline" size="sm" class="mr-2" @click="openEdit(u)">Edit</Button>
                  <AlertDialog>
                    <AlertDialogTrigger as-child>
                      <Button variant="destructive" size="sm" :disabled="Boolean(me && u.id === me.id)">Delete</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {{ u.username }}?</AlertDialogTitle>
                        <AlertDialogDescription>The account is removed permanently.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction @click="deleteUser.mutate(u.id)">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <Card class="max-w-md">
      <CardHeader>
        <CardTitle class="text-base">Create user</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="space-y-1.5">
          <Label>Username</Label>
          <Input v-model="username" placeholder="johndoe" />
        </div>
        <div class="space-y-1.5">
          <Label>Display name</Label>
          <Input v-model="displayName" placeholder="John Doe" />
        </div>
        <div class="space-y-1.5">
          <Label>Password</Label>
          <Input v-model="password" type="password" placeholder="min 6 characters" />
        </div>
        <div class="space-y-1.5">
          <Label>Role</Label>
          <Select v-model="role">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin — full control</SelectItem>
              <SelectItem value="developer">Developer — builds tables</SelectItem>
              <SelectItem value="editor">Editor — manages records</SelectItem>
              <SelectItem value="viewer">Viewer — read only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button :disabled="createUser.isPending.value" @click="submitCreate">Create user</Button>
      </CardContent>
    </Card>

    <!-- Edit dialog -->
    <Dialog :open="editing !== null" @update:open="(v) => (editing = v ? editing : null)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {{ editing?.username }}</DialogTitle>
          <DialogDescription>Leave password blank to keep it unchanged.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <p v-if="editError" class="text-sm text-destructive">{{ editError }}</p>
          <div class="space-y-1.5">
            <Label>Display name</Label>
            <Input v-model="editDisplayName" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Role</Label>
              <Select v-model="editRole">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — full control</SelectItem>
                  <SelectItem value="developer">Developer — builds tables</SelectItem>
                  <SelectItem value="editor">Editor — manages records</SelectItem>
                  <SelectItem value="viewer">Viewer — read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label>Organization</Label>
              <Select v-model="editOrgId">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem v-for="o in orgsQ.data.value ?? []" :key="o.id" :value="String(o.id)">
                    {{ o.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="space-y-1.5">
            <Label>New password</Label>
            <Input v-model="editPassword" type="password" placeholder="(unchanged)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editing = null">Cancel</Button>
          <Button :disabled="updateUser.isPending.value" @click="submitEdit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
