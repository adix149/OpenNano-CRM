<script setup lang="ts">
defineProps<{ rows: any[]; groupField: string }>();
</script>
<template>
  <div class="flex gap-4 overflow-x-auto">
    <div v-for="group in [...new Set(rows.map(r=>r[groupField]))]" :key="String(group)" class="min-w-[200px] border rounded p-2 bg-muted/20">
      <div class="font-medium text-sm mb-2">{{ group ?? '—' }}</div>
      <div v-for="r in rows.filter(x=>x[groupField]===group)" :key="r.id" class="bg-white border rounded p-2 mb-1 text-sm">#{{ r.id }}</div>
    </div>
  </div>
</template>
