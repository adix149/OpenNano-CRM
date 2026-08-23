<script setup lang="ts">
import { computed } from "vue";
import type { Entity } from "@/lib/api";
import { rowDisplayLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RelationCell from "@/components/RelationCell.vue";
const props = defineProps<{
  entity: Entity;
  row: Record<string, unknown>;
  showLinked?: boolean;
}>();

const detailFields = computed(() => props.entity.fields.filter((f) => f.inDetail !== false));



function fmt(type: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "boolean") return v ? "Yes" : "No";
  if (type === "date") return String(v).slice(0, 10);
  if (type === "datetime") return String(v).slice(0, 16).replace("T", " ");
  return String(v);
}

const title = computed(() => rowDisplayLabel(props.entity, props.row));
</script>

<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-lg font-semibold">{{ title }}</h3>
      <p class="text-xs text-muted-foreground">Record #{{ row.id }} · {{ entity.label }}</p>
    </div>

    <Card>
      <CardHeader class="pb-2"><CardTitle class="text-sm">Details</CardTitle></CardHeader>
      <CardContent>
        <dl class="divide-y">
          <div v-for="f in detailFields" :key="f.id" class="grid grid-cols-3 gap-3 py-2.5 text-sm">
            <dt class="text-muted-foreground">{{ f.label }}</dt>
            <dd class="col-span-2 min-w-0 break-words">
              <RelationCell v-if="f.type === 'relation'" :target-id="f.relationEntityId" :value="row[f.name]" />
              <template v-else>{{ fmt(f.type, row[f.name]) }}</template>
              <Badge v-if="f.isRequired" variant="outline" class="ml-2 h-4 px-1 text-[10px] uppercase">required</Badge>
            </dd>
          </div>
          <div v-if="detailFields.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            No fields marked visible — enable "Show on record page" in Dev → Fields.
          </div>
        </dl>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2"><CardTitle class="text-sm">Record info</CardTitle></CardHeader>
      <CardContent class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-muted-foreground">ID</span><code>#{{ row.id }}</code></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Created</span><span>{{ String(row.created_at ?? "").slice(0,19).replace("T"," ") || "—" }}</span></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Table</span><code>{{ entity.slug }}</code></div>
      </CardContent>
    </Card>

    <slot name="linked" />
  </div>
</template>
