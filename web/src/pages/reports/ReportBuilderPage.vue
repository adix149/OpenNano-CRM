<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { api, type ReportBlock } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isBuilder } from "@/lib/personas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const projectId = Number(route.params.projectId);
const reportId = Number(route.params.reportId) || null;
const { user } = useAuth();
const editable = computed(() => isBuilder(user.value?.role));
const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
const entitiesQuery = useQuery({ queryKey: ["entities"], queryFn: api.listEntities });
const reportQuery = useQuery({ queryKey: ["report", projectId, reportId], queryFn: () => api.getReport(projectId, reportId!), enabled: Boolean(reportId) });

const label = ref("New report");
const slug = ref("new_report");
const description = ref("");
const title = ref("Project report");
const subtitle = ref("");
const blocks = ref<ReportBlock[]>([]);
const error = ref("");
const draggedBlock = ref<string | null>(null);

watch(() => reportQuery.data.value, (report) => {
  if (!report) return;
  label.value = report.label;
  slug.value = report.slug;
  description.value = report.description ?? "";
  title.value = report.layout.title;
  subtitle.value = report.layout.subtitle ?? "";
  blocks.value = [...report.layout.blocks];
}, { immediate: true });

const availableTables = computed(() => (entitiesQuery.data.value ?? []).filter((table) => table.orgId === projectQuery.data.value?.orgId));
const availableFields = computed(() => availableTables.value.flatMap((table) => table.fields.map((field) => ({ table, field }))));
const blockKey = (tableId: number, columnId: number) => `${tableId}:${columnId}`;

function addField(tableId: number, columnId: number) {
  const candidate = availableFields.value.find((item) => item.table.id === tableId && item.field.id === columnId);
  if (!candidate || blocks.value.some((block) => block.kind === "field" && block.tableId === tableId && block.columnId === columnId)) return;
  blocks.value.push({ id: crypto.randomUUID(), tableId, columnId, label: candidate.field.label, width: "half", kind: "field" });
}

function addBlock(kind: "heading" | "spacer") {
  blocks.value.push({ id: crypto.randomUUID(), tableId: projectId, columnId: projectId, label: kind === "heading" ? "Section heading" : "Spacer", width: "full", kind, text: kind === "heading" ? "New section" : undefined });
}

function dropOnCanvas(event: DragEvent) {
  const value = event.dataTransfer?.getData("field");
  if (!value) return;
  const [tableId, columnId] = value.split(":").map(Number);
  addField(tableId, columnId);
}

function dropBefore(index: number) {
  if (!draggedBlock.value) return;
  const from = blocks.value.findIndex((block) => block.id === draggedBlock.value);
  if (from < 0 || from === index) return;
  const [block] = blocks.value.splice(from, 1);
  blocks.value.splice(index > from ? index - 1 : index, 0, block);
  draggedBlock.value = null;
}

const save = useMutation({
  mutationFn: () => {
    const payload = { slug: slug.value.trim(), label: label.value.trim(), description: description.value.trim() || undefined, layout: { title: title.value.trim() || label.value.trim(), subtitle: subtitle.value.trim() || undefined, blocks: blocks.value } };
    return reportId ? api.updateReport(projectId, reportId, payload) : api.createReport(projectId, payload);
  },
  onSuccess: async (report) => {
    error.value = "";
    await queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
    await queryClient.invalidateQueries({ queryKey: ["report", projectId] });
    if (!reportId) router.replace(`/dev/projects/${projectId}/reports/${report.id}`);
  },
  onError: (e) => (error.value = e.message),
});

async function downloadPdf() {
  if (!reportId) return;
  const blob = await api.reportPdf(projectId, reportId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug.value}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printPreview() {
  window.print();
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <RouterLink :to="`/admin/projects/${projectId}`" class="text-xs text-muted-foreground hover:underline">Project reports</RouterLink>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">{{ reportId ? label : "Build a report" }}</h1>
        <p class="text-sm text-muted-foreground">{{ projectQuery.data.value?.name }} · fields from this organization</p>
      </div>
      <div class="flex gap-2 print:hidden">
        <Button variant="outline" size="sm" @click="printPreview">Print preview</Button>
        <Button v-if="reportId" variant="outline" size="sm" @click="downloadPdf">Download PDF</Button>
        <Button v-if="editable" size="sm" :disabled="save.isPending.value" @click="save.mutate()">{{ save.isPending.value ? "Saving…" : "Save report" }}</Button>
      </div>
    </div>
    <p v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>

    <div class="grid items-start gap-5 xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
      <Card v-if="editable" class="print:hidden">
        <CardHeader class="pb-3"><CardTitle class="text-sm">Field palette</CardTitle><CardDescription>Drag fields onto the canvas.</CardDescription></CardHeader>
        <CardContent class="space-y-4">
          <div v-for="table in availableTables" :key="table.id">
            <p class="mb-1 text-xs font-semibold text-muted-foreground">{{ table.label }}</p>
            <div class="space-y-1">
              <button v-for="field in table.fields" :key="field.id" draggable="true" class="report-palette-item" @dragstart="(event) => event.dataTransfer?.setData('field', blockKey(table.id, field.id))" @click="addField(table.id, field.id)">
                <span class="min-w-0 truncate">{{ field.label }}</span><span class="report-type-pill">{{ field.type }}</span>
              </button>
            </div>
          </div>
          <div class="border-t pt-3"><p class="mb-2 text-xs font-semibold text-muted-foreground">Layout blocks</p><div class="flex gap-2"><Button variant="outline" size="sm" @click="addBlock('heading')">+ Heading</Button><Button variant="outline" size="sm" @click="addBlock('spacer')">+ Space</Button></div></div>
        </CardContent>
      </Card>

      <Card class="report-canvas-card">
        <CardHeader><CardTitle class="text-base">{{ title || "Untitled report" }}</CardTitle><CardDescription>{{ subtitle || "Drag, reorder, and style your report content." }}</CardDescription></CardHeader>
        <CardContent class="report-canvas min-h-[30rem]" @dragover.prevent @drop="dropOnCanvas">
          <div v-for="(block, index) in blocks" :key="block.id" draggable="true" class="report-block" :class="`report-block-${block.width}`" @dragstart="draggedBlock = block.id" @dragover.prevent @drop.stop="dropBefore(index)">
            <template v-if="block.kind === 'field'">
              <span class="drag-handle print:hidden" title="Drag to reorder">::</span><div class="min-w-0 flex-1"><div class="report-source">{{ availableFields.find((item) => item.field.id === block.columnId)?.table.label }}</div><div class="font-medium">{{ block.label }}</div></div>
              <select v-model="block.width" class="h-8 rounded border bg-background px-2 text-xs print:hidden"><option value="full">Full width</option><option value="half">Half width</option><option value="third">One third</option></select>
            </template>
            <template v-else-if="block.kind === 'heading'"><Input v-model="block.text" class="font-semibold" /><span class="text-xs text-muted-foreground">Heading</span></template>
            <div v-else class="w-full border-t border-dashed"><span class="text-[10px] text-muted-foreground print:hidden">Spacer</span></div>
            <button class="report-remove print:hidden" @click="blocks.splice(index, 1)">×</button>
          </div>
          <div v-if="blocks.length === 0" class="flex min-h-[20rem] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">Drop fields here to start your report</div>
        </CardContent>
      </Card>

      <Card v-if="editable" class="print:hidden">
        <CardHeader class="pb-3"><CardTitle class="text-sm">Report settings</CardTitle><CardDescription>These values appear in print and PDF output.</CardDescription></CardHeader>
        <CardContent class="space-y-4"><div class="space-y-1.5"><Label>Name</Label><Input v-model="label" /></div><div class="space-y-1.5"><Label>Slug</Label><Input v-model="slug" /></div><div class="space-y-1.5"><Label>Print title</Label><Input v-model="title" /></div><div class="space-y-1.5"><Label>Subtitle</Label><Textarea v-model="subtitle" :rows="3" /></div><div class="space-y-1.5"><Label>Description</Label><Textarea v-model="description" :rows="3" /></div></CardContent>
      </Card>
    </div>
  </div>
</template>
