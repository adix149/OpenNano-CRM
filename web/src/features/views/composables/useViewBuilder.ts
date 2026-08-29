import { ref, computed } from "vue";

type Layout = { sections: any[] };

export function useViewBuilder(initial?: Layout) {
  const sections = ref(initial?.sections ?? [{ id: "s1", title: "Section 1", cols: 2, fields: [] }]);
  const selected = ref<string | null>(null);
  const layout = computed(() => ({ sections: sections.value }));
  function addField(name: string) {
    sections.value[0].fields.push({ name, span: 6, hidden: false });
  }
  return { sections, selected, layout, addField };
}
