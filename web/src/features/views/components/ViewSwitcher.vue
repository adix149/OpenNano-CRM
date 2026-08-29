<script setup lang="ts">
defineProps<{ kind: string }>();
defineEmits<{ "update:kind": [v: string] }>();
const kinds = ["table","form","calendar","kanban","pdf"];
</script>
<template>
  <div class="flex gap-1">
    <button v-for="k in kinds" :key="k" @click="$emit('update:kind', k)" :class="['px-3 py-1 rounded text-sm border', kind===k?'bg-primary text-white':'bg-white']">{{ k }}</button>
  </div>
</template>
