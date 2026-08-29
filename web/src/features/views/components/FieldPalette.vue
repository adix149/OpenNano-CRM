<script setup lang="ts">
defineProps<{ fields: any[] }>();
defineEmits<{ add: [name: string] }>();
</script>
<template>
  <div class="space-y-1">
    <div v-for="f in fields" :key="f.name" draggable="true" @dragstart="$emit('add', f.name)" class="border rounded p-2 text-sm cursor-grab bg-white hover:bg-muted">
      {{ f.label }} <span class="text-xs text-muted-foreground">({{ f.name }})</span>
    </div>
  </div>
</template>
