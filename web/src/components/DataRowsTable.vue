<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { RouterLink } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type Entity, type EntityField } from "@/lib/api";
import { rowDisplayLabel } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { hasPersona } from "@/lib/personas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import RelationCell from "@/components/RelationCell.vue";
import RecordDetailContent from "@/components/RecordDetailContent.vue";
import LinkedRecords from "@/components/LinkedRecords.vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 25;

const props = defineProps<{ entity: Entity }>();

const error = ref("");
const search = ref("");
const page = ref(1);

// ── Column sort / filter state ──
const sortKey = ref<string | null>(null);
const sortDir = ref<"asc" | "desc">("asc");
const colFilters = ref<Record<string, string>>({});
const showFilters = ref(false);

function toggleSort(f: EntityField) {
  if (sortKey.value !== f.name) {
    sortKey.value = f.name;
    sortDir.value = "asc";
  } else if (sortDir.value === "asc") {
    sortDir.value = "desc";
  } else {
    sortKey.value = null;
  }
}

const { user } = useAuth();
const mayEdit = computed(() => hasPersona(user.value?.role, props.entity.editRole ?? "editor"));

const rowsQuery = useQuery({
  queryKey: computed(() => ["rows", props.entity.orgSlug ?? "", props.entity.slug]),
  queryFn: () => api.listRows(props.entity.orgSlug!, props.entity.slug),
});
const queryClient = useQueryClient();
const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });

/** id -> display label for every referenced table (shared query cache). */
const relLabels = ref<Record<string, Record<number, string>>>({});
watchEffect(async () => {
  const out: Record<string, Record<number, string>> = {};
  for (const f of props.entity.fields) {
    if (f.type !== "relation" || !f.relationEntityId || !props.entity.orgSlug) continue;
    const tgt = (entitiesQuery.data.value ?? []).find((e) => e.id === f.relationEntityId);
    if (!tgt?.orgSlug) continue;
    try {
      const rows = await queryClient.ensureQueryData({
        queryKey: ["rows", tgt.orgSlug, tgt.slug],
        queryFn: () => api.listRows(tgt.orgSlug!, tgt.slug),
      });
      const m: Record<number, string> = {};
      for (const r of rows as Record<string, unknown>[]) m[Number(r.id)] = rowDisplayLabel(tgt, r);
      out[f.name] = m;
    } catch {}
  }
  relLabels.value = out;
});

const deleteRow = useMutation({
  mutationFn: (id: number) => api.deleteRow(props.entity.orgSlug!, props.entity.slug, id),
  onSuccess: async () => {
    error.value = "";
    await queryClient.invalidateQueries({ queryKey: ["rows", props.entity.orgSlug, props.entity.slug] });
  },
  onError: (err) => (error.value = err.message),
});

function cellText(field: EntityField, row: Record<string, unknown>): string {
  const value = row[field.name];
  if (field.type === "relation") return "";
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "date") return String(value).slice(0, 10);
  if (field.type === "datetime") return String(value).slice(0, 16).replace("T", " ");
  return String(value);
}

/** What a cell shows, used for both filtering and sorting. */
function displayOf(field: EntityField, row: Record<string, unknown>): string {
  if (field.type === "relation") {
    const v = row[field.name];
    if (v === null || v === undefined || v === "") return "";
    const map = relLabels.value[field.name];
    return map?.[Number(v)] ?? `#${v}`;
  }
  return cellText(field, row);
}

function clearAll() {
  search.value = "";
  colFilters.value = {};
  sortKey.value = null;
  page.value = 1;
}

const activeFilterCount = computed(
  () => Object.values(colFilters.value).filter((v) => v && v.trim()).length,
);

const processed = computed(() => {
  let rows = [...(rowsQuery.data.value ?? [])];
  const q = search.value.trim().toLowerCase();

  rows = rows.filter((row) => {
    if (q && !props.entity.fields.some((f) => displayOf(f, row).toLowerCase().includes(q))) return false;
    for (const [name, needle] of Object.entries(colFilters.value)) {
      if (!needle || !needle.trim()) continue;
      const f = props.entity.fields.find((x) => x.name === name);
      if (!f) continue;
      if (!displayOf(f, row).toLowerCase().includes(needle.trim().toLowerCase())) return false;
    }
    return true;
  });

  if (sortKey.value) {
    const f = props.entity.fields.find((x) => x.name === sortKey.value);
    if (f) {
      const dir = sortDir.value === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const da = displayOf(f, a);
        const dbb = displayOf(f, b);
        const na = Number(da);
        const nb = Number(dbb);
        if (da === "" && dbb !== "") return 1 * dir;
        if (dbb === "" && da !== "") return -1 * dir;
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;
        return da.localeCompare(dbb, undefined, { numeric: true }) * dir;
      });
    }
  }
  return rows;
});

const totalPages = computed(() => Math.max(1, Math.ceil(processed.value.length / PAGE_SIZE)));
const paged = computed(() => processed.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

watchEffect(() => {
  if (page.value > totalPages.value) page.value = 1;
});

function prev() {
  if (page.value > 1) page.value--;
}
function next() {
  if (page.value < totalPages.value) page.value++;
}

const detailRow = ref<Record<string, unknown> | null>(null);
const detailOpen = ref(false);
function openDetail(row: Record<string, unknown>) {
  detailRow.value = row;
  detailOpen.value = true;
}
const detailIncoming = computed(() =>
  !detailRow.value
    ? []
    : (entitiesQuery.data.value ?? [])
        .filter((e) => e.id !== props.entity.id)
        .flatMap((e) => e.fields.filter((f) => f.relationEntityId === props.entity.id).map((f) => ({ source: e, field: f }))),
);
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <Input v-model="search" placeholder="Search rows…" class="max-w-xs" />
      <Button
        variant="outline"
        size="sm"
        :class="showFilters ? 'border-primary text-primary' : ''"
        @click="showFilters = !showFilters"
      >
        Filter columns
      </Button>
      <Button v-if="activeFilterCount > 0 || search || sortKey" variant="ghost" size="sm" @click="clearAll">
        Clear
      </Button>
      <span class="text-sm text-muted-foreground">{{ processed.length }} row(s)</span>
      <div class="ml-auto flex items-center gap-2" v-if="totalPages > 1">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="prev">Prev</Button>
        <span class="text-sm text-muted-foreground">{{ page }} / {{ totalPages }}</span>
        <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="next">Next</Button>
      </div>
    </div>

    <p v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {{ error }}
    </p>

    <div class="overflow-x-auto rounded-md border" v-if="processed.length > 0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              v-for="f in entity.fields"
              :key="f.id"
              class="cursor-pointer select-none whitespace-nowrap"
              @click="toggleSort(f)"
            >
              <span :class="sortKey === f.name ? 'font-semibold text-primary' : ''">{{ f.label }}</span>
              <span v-if="sortKey === f.name" class="ml-1 text-primary">{{ sortDir === "asc" ? "▲" : "▼" }}</span>
            </TableHead>
            <TableHead class="w-40 text-right">Actions</TableHead>
          </TableRow>
          <TableRow v-if="showFilters">
            <TableCell v-for="f in entity.fields" :key="'f-' + f.id" class="py-1.5">
              <Input
                :model-value="colFilters[f.name] ?? ''"
                @update:model-value="(v: any) => ((colFilters[f.name] = String(v ?? '')), (page = 1))"
                :placeholder="f.type === 'relation' ? 'Filter by name…' : 'Filter…'"
                class="h-7 text-xs"
              />
            </TableCell>
            <TableCell class="py-1.5"></TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="row in paged"
            :key="row.id"
            class="cursor-pointer transition-colors hover:bg-muted/50"
            @click="openDetail(row)"
          >
            <TableCell v-for="f in entity.fields" :key="f.id">
              <span v-if="f.type === 'relation'" @click.stop>
                <RelationCell :target-id="f.relationEntityId" :value="row[f.name]" />
              </span>
              <template v-else>{{ cellText(f, row) }}</template>
            </TableCell>
            <TableCell class="text-right" @click.stop>
              <template v-if="mayEdit">
                <Button variant="outline" size="sm" as-child class="mr-2">
                  <RouterLink :to="`/data/${entity.slug}/${row.id}/edit`">Edit</RouterLink>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger as-child>
                    <Button variant="destructive" size="sm">Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction @click="deleteRow.mutate(row.id)">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </template>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <p v-else-if="!rowsQuery.isLoading.value" class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      {{ search || activeFilterCount > 0 ? "No rows match your filters." : `No ${entity.label.toLowerCase()} records yet.` }}
    </p>

    <Dialog v-model:open="detailOpen">
      <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record detail — {{ entity.label }}</DialogTitle>
        </DialogHeader>
        <RecordDetailContent v-if="detailRow" :entity="entity" :row="detailRow" />
        <div v-if="detailIncoming.length > 0" class="mt-4 space-y-3">
          <h4 class="text-sm font-medium">Linked records</h4>
          <div v-for="item in detailIncoming" :key="item.source.id + item.field.name" class="rounded-md border p-3">
            <LinkedRecords :source="item.source" :field="item.field" :record-id="Number(detailRow!.id)" />
          </div>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="outline" @click="detailOpen = false">Close</Button>
          <Button v-if="mayEdit && detailRow" as-child>
            <RouterLink :to="`/data/${entity.slug}/${detailRow.id}/edit`">Edit</RouterLink>
          </Button>
          <Button variant="outline" v-if="detailRow" as-child>
            <RouterLink :to="`/data/${entity.slug}/${detailRow.id}`">Open full page</RouterLink>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
