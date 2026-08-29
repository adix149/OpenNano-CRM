<script setup lang="ts">
defineProps<{ layout: any; fields: any[] }>();
</script>
<template>
  <div class="border rounded p-4 min-h-[300px] bg-muted/20">
    <div v-for="s in layout.sections" :key="s.id" class="mb-4">
      <h3 class="font-medium mb-2">{{ s.title }}</h3>
      <div class="grid grid-cols-12 gap-2">
        <div v-for="f in s.fields" :key="f.name" :class="`col-span-${f.span}`" class="border bg-white p-2 rounded text-sm">
          {{ f.name }}
        </div>
        <div v-if="s.fields.length===0" class="col-span-12 text-sm text-muted-foreground border-dashed border p-4 text-center">Drag fields here</div>
      </div>
    </div>
  </div>
</template>
