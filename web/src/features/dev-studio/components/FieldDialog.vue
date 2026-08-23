<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FieldTypePicker from "@/components/dev/FieldTypePicker.vue";

const props = defineProps<{
  open: boolean;
  mode: "add" | "edit";
  name: string;
  label: string;
  type: any;
  required: boolean;
  options: string;
  target: string;
  relationKey: string;
  inDetail: boolean;
  error: string;
}>();

const emit = defineEmits<{
  "update:open": [v: boolean];
  "update:name": [v: string];
  "update:label": [v: string];
  "update:type": [v: any];
  "update:required": [v: boolean];
  "update:options": [v: string];
  "update:target": [v: string];
  "update:relationKey": [v: string];
  "update:inDetail": [v: boolean];
  submit: [];
}>();

const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const relationTargets = computed(() => entitiesQuery.data.value ?? []);
function targetFields(slug: string) {
  return entitiesQuery.data.value?.find((e) => e.slug === slug)?.fields ?? [];
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ mode === "add" ? "Add field" : "Edit field" }}</DialogTitle>
        <DialogDescription>Column name must match ^[a-z][a-z0-9_]*$</DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <p v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5"><Label>Label</Label><Input :model-value="label" @update:model-value="(v) => emit('update:label', String(v))" /></div>
          <div class="space-y-1.5"><Label>Column name</Label><Input :model-value="name" @update:model-value="(v) => emit('update:name', String(v))" /></div>
        </div>
        <div class="space-y-1.5"><Label>Type</Label><FieldTypePicker :model-value="type" @update:model-value="(v) => emit('update:type', v)" /></div>
        <div v-if="type === 'select'" class="space-y-1.5">
          <Label>Options (one per line)</Label><Textarea :model-value="options" @update:model-value="(v) => emit('update:options', String(v))" :rows="4" />
        </div>
        <div v-if="type === 'relation'" class="space-y-2">
          <div class="space-y-1.5">
            <Label>Connect to table</Label>
            <select :value="target" @change="(e) => { emit('update:target', (e.target as HTMLSelectElement).value); emit('update:relationKey', ''); }" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="" disabled>Select target table…</option>
              <option v-for="e in relationTargets" :key="e.id" :value="e.slug">{{ e.label }} ({{ e.slug }})</option>
            </select>
          </div>
          <div v-if="target" class="space-y-1.5 rounded-md border bg-muted/40 p-3">
            <Label>Key column</Label>
            <select :value="relationKey" @change="(e) => emit('update:relationKey', (e.target as HTMLSelectElement).value)" class="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="" disabled>Pick the column to link on…</option>
              <option v-for="tf in targetFields(target)" :key="tf.name" :value="tf.name">{{ tf.label }} ({{ tf.name }})</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-2"><Checkbox :model-value="required" @update:model-value="(v) => emit('update:required', Boolean(v))" id="f-req" /><Label for="f-req">Required</Label></div>
        <div class="flex items-center gap-2"><Checkbox :model-value="inDetail" @update:model-value="(v) => emit('update:inDetail', Boolean(v))" id="f-detail" /><Label for="f-detail">Show on record page</Label></div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button @click="emit('submit')">{{ mode === "add" ? "Add field" : "Save changes" }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
