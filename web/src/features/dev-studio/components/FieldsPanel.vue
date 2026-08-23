<script setup lang="ts">
import type { Entity, EntityField } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

defineProps<{
  entity: Entity;
  referencedBy: { fromLabel: string; fromSlug: string; fieldName: string; key: string }[];
}>();

defineEmits<{
  add: [];
  edit: [field: EntityField];
  delete: [field: EntityField];
}>();

function variant(t: string) {
  return (t === "relation" ? "default" : t === "select" ? "secondary" : "outline") as any;
}
</script>

<template>
  <Card>
    <CardHeader class="flex-row items-center justify-between space-y-0 pb-3">
      <div>
        <CardTitle class="text-base">Fields</CardTitle>
        <CardDescription>Each field becomes a real Postgres column.</CardDescription>
      </div>
      <Button size="sm" @click="$emit('add')">+ Add field</Button>
    </CardHeader>
    <CardContent class="space-y-2">
      <p v-if="entity.fields.length === 0" class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No fields yet. Add your first field — try Text or a Connection Key.
      </p>
      <div v-for="f in entity.fields" :key="f.id" class="flex items-center gap-3 rounded-md border px-3 py-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ f.label }}</span>
            <span v-if="f.isRequired" class="text-xs text-destructive">*</span>
            <span v-if="f.inDetail === false" class="text-[10px] text-muted-foreground">(hidden)</span>
          </div>
          <div class="truncate text-xs text-muted-foreground">
            <code>{{ f.name }}</code>
            <template v-if="f.type === 'select'"> · {{ (f.options ?? []).length }} option(s)</template>
          </div>
        </div>
        <Badge :variant="variant(f.type)">{{ f.type === "relation" ? "connection" : f.type }}</Badge>
        <div class="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" @click="$emit('edit', f)">Edit</Button>
          <Button variant="ghost" size="sm" class="text-destructive" @click="$emit('delete', f)">Delete</Button>
        </div>
      </div>

      <div v-if="referencedBy.length > 0" class="rounded-md border bg-muted/40 p-3">
        <div class="mb-1 text-xs font-medium uppercase text-muted-foreground">Referenced by</div>
        <div v-for="r in referencedBy" :key="r.fromSlug + r.fieldName" class="py-0.5 text-sm">
          <RouterLink :to="`/dev/t/${r.fromSlug}`" class="underline-offset-2 hover:underline">{{ r.fromLabel }}.{{ r.fieldName }}</RouterLink>
          <span class="text-muted-foreground"> · displays {{ r.key }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
