<script setup lang="ts">
defineProps<{ rows: any[]; dateField: string }>();
</script>
<template>
  <div class="border rounded p-4">
    <div class="text-sm text-muted-foreground">Calendar view — date field: {{ dateField }}</div>
    <div v-for="r in rows" :key="r.id" class="border-b py-1 text-sm">{{ r[dateField] }} — #{{ r.id }}</div>
  </div>
</template>
