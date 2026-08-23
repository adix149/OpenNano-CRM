<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type Entity, type EntityField } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const props = defineProps<{ entity: Entity; target: EntityField | null }>();
const emit = defineEmits<{ close: [] }>();

const queryClient = useQueryClient();
const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });

const open = computed(() => props.target !== null);
const error = ref("");
const reassign = ref("");

const affected = computed(() => {
  if (!props.target) return [];
  return (entitiesQuery.data.value ?? []).flatMap((e) =>
    e.fields
      .filter((f) => f.relationEntityId === props.entity.id && f.relationFieldName === props.target!.name)
      .map((f) => ({ fromLabel: e.label, fromSlug: e.slug, fieldName: f.name })),
  );
});

const options = computed(() => props.entity.fields.filter((f) => f.name !== props.target?.name));

watch(
  () => props.target,
  (t) => {
    if (t) {
      const firstText = options.value.find((x) => ["text", "email", "phone", "select"].includes(x.type));
      reassign.value = firstText?.name ?? "__id__";
      error.value = "";
    }
  },
);

const del = useMutation({
  mutationFn: () => api.deleteField(props.entity.orgSlug!, props.entity.slug, props.target!.name, affected.value.length > 0 ? reassign.value : undefined),
  onSuccess: async () => {
    emit("close");
    await queryClient.invalidateQueries({ queryKey: ["entities"] });
  },
  onError: (e: any) => (error.value = e.message),
});
</script>

<template>
  <Dialog :open="open" @update:open="(v) => !v && emit('close')">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Delete “{{ target?.label }}”?</DialogTitle>
        <DialogDescription>Drops the column and its data on every row.</DialogDescription>
      </DialogHeader>
      <div class="space-y-3">
        <p v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>
        <div v-if="affected.length > 0" class="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <div class="font-medium text-amber-700 dark:text-amber-400">This column is a connection key</div>
          <ul class="mt-1 list-disc pl-5 text-muted-foreground">
            <li v-for="a in affected" :key="a.fromSlug + a.fieldName">{{ a.fromLabel }}.{{ a.fieldName }}</li>
          </ul>
          <div class="mt-2 space-y-1.5">
            <Label>Repoint these connections to</Label>
            <select v-model="reassign" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option v-for="o in options" :key="o.name" :value="o.name">{{ o.label }} ({{ o.name }})</option>
              <option value="__id__">Record id (#id)</option>
            </select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="emit('close')">Cancel</Button>
        <Button variant="destructive" :disabled="del.isPending.value" @click="del.mutate()">Delete column</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
