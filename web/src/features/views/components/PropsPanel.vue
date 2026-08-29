<script setup lang="ts">
defineProps<{ field?: any }>();
</script>
<template>
  <div class="border rounded p-3 text-sm">
    <div v-if="field">Editing {{ field.name }}</div>
    <div v-else class="text-muted-foreground">Select a field</div>
  </div>
</template>
