import { ref } from "vue";


/** Selected project in Dev Studio, persisted per browser. */
const stored = (() => {
  try {
    return localStorage.getItem("dev.projectId");
  } catch {
    return null;
  }
})();

export const devProjectId = ref<number | null>(stored ? Number(stored) : null);

export function setDevProject(id: number | null) {
  devProjectId.value = id;
  try {
    if (id === null) localStorage.removeItem("dev.projectId");
    else localStorage.setItem("dev.projectId", String(id));
  } catch {}
}
