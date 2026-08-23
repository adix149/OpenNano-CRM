<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type Entity, type EntityField } from "@/lib/api";

interface Props {
  modelValue: number | string | null | undefined;
  field: EntityField;
  disabled?: boolean;
  id: string;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();

const open = ref(false);
const search = ref("");
const options = ref<{ id: number; label: string }[]>([]);
const loading = ref(false);
const selectedLabel = ref("");

/** Preferred label column: the connection's chosen key, else first text-like field. */
function displayColumn(ent: Entity): EntityField | undefined {
  return (
    ent.fields.find((f) => f.name === props.field.relationFieldName) ??
    ent.fields.find((f) => ["text", "email", "phone", "select"].includes(f.type)) ??
    ent.fields[0]
  );
}
function keyColumn(): string | undefined {
  return props.field.relationFieldName ?? undefined;
}

let targetSlug: string | null = null;
let targetOrg: string | null = null;

async function resolveTarget() {
  if (!props.field.relationEntityId) return;
  try {
    const entities = await api.listEntities();
    const target = entities.find((e: Entity) => e.id === props.field.relationEntityId);
    if (target) {
      targetSlug = target.slug;
      targetOrg = target.orgSlug ?? null;
      // If current value is set, fetch its label
      if (props.modelValue) {
        try {
          const row = await api.getRow(target.orgSlug ?? "", target.slug, Number(props.modelValue));
          const displayField = displayColumn(target)?.name;
          selectedLabel.value = String((row as any)[displayField ?? "id"] ?? props.modelValue);
        } catch {
          selectedLabel.value = String(props.modelValue);
        }
      }
      await fetchOptions("");
    }
  } catch {}
}

async function fetchOptions(q: string) {
  if (!targetSlug) return;
  loading.value = true;
  try {
    if (!targetOrg) return;
    const res = await api.lookup(targetOrg, targetSlug, q, 20, keyColumn() ?? undefined);
    options.value = res;
  } catch {
    options.value = [];
  } finally {
    loading.value = false;
  }
}

let debounce: any = null;
watch(search, (val) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => fetchOptions(val), 300);
});

watch(
  () => props.field.relationEntityId,
  () => resolveTarget(),
  { immediate: true },
);

watch(
  () => props.modelValue,
  async (val) => {
    if (!val) {
      selectedLabel.value = "";
      return;
    }
    if (targetSlug) {
      try {
        const row = await api.getRow(targetOrg ?? "", targetSlug, Number(val));
        // Try to get display label from the row
        if (row) {
          // Find display field from target
          const entities = await api.listEntities();
          const target = entities.find((e: Entity) => e.id === props.field.relationEntityId);
          const displayField = target ? displayColumn(target)?.name : undefined;
          selectedLabel.value = String((row as any)[displayField ?? "id"] ?? val);
        }
      } catch {
        selectedLabel.value = String(val);
      }
    }
  },
);

function selectOption(opt: { id: number; label: string }) {
  selectedLabel.value = opt.label;
  emit("update:modelValue", opt.id);
  open.value = false;
}

function clear() {
  selectedLabel.value = "";
  emit("update:modelValue", null);
  open.value = false;
}

const display = computed(() => selectedLabel.value || (props.modelValue ? String(props.modelValue) : ""));
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="id">{{ field.label }}</Label>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button :id="id" variant="outline" :disabled="disabled" class="w-full justify-between font-normal">
          <span class="truncate">{{ display || `Choose ${field.label}` }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-[320px] p-2" align="start">
        <Input v-model="search" placeholder="Search..." class="h-8 mb-2" />
        <div class="max-h-48 overflow-auto space-y-1">
          <div v-if="loading" class="text-sm text-muted-foreground p-2">Loading...</div>
          <div v-for="opt in options" :key="opt.id" class="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer" @click="selectOption(opt)">
            <span class="text-sm">{{ opt.label }}</span>
            <span class="text-xs text-muted-foreground">#{{ opt.id }}</span>
          </div>
          <div v-if="!loading && options.length === 0" class="text-sm text-muted-foreground p-2">No results</div>
        </div>
        <div class="flex justify-between mt-2 pt-2 border-t">
          <Button variant="ghost" size="sm" @click="clear">Clear</Button>
          <Button variant="ghost" size="sm" @click="open = false">Close</Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
