<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { parseDate, parseDateTime, CalendarDateTime, type DateValue } from "@internationalized/date";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarIcon } from "@lucide/vue";

/**
 * Calendar popover for `date` fields; adds a time input for `datetime` fields.
 * Model value is a plain string: "YYYY-MM-DD" (date) or "YYYY-MM-DDTHH:mm"
 * (datetime). Empty/undefined means unset.
 *
 * Sync contract:
 * - The calendar always reflects the text that is currently typed, falling
 *   back to the committed modelValue, and finally to "today" (no value).
 * - Picking a date on the calendar immediately updates the text field too.
 * - Typing keeps the calendar's highlighted month in sync without needing Set.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string;
    withTime?: boolean;
    disabled?: boolean;
    placeholder?: string;
    id?: string;
  }>(),
  { withTime: false, disabled: false, placeholder: "Pick a date", modelValue: undefined },
);

const emit = defineEmits<{ "update:modelValue": [value: string | undefined] }>();

const open = ref(false);
const timeString = ref("00:00");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse the incoming committed string into a DateValue for the calendar. */
const committedDateValue = computed<DateValue | undefined>(() => {
  if (!props.modelValue) return undefined;
  try {
    const iso = props.modelValue.slice(0, props.withTime ? 16 : 10);
    return props.withTime ? parseDateTime(iso) : parseDate(iso);
  } catch {
    return undefined;
  }
});

watch(
  () => props.modelValue,
  () => {
    const dv = committedDateValue.value;
    if (props.withTime && dv instanceof CalendarDateTime) {
      timeString.value = `${pad(dv.hour)}:${pad(dv.minute)}`;
    }
  },
  { immediate: true },
);

function updateFromCalendar(value: DateValue | undefined) {
  if (!value) {
    emit("update:modelValue", undefined);
    return;
  }
  const base = `${pad(value.year)}-${pad(value.month)}-${pad(value.day)}`;
  const next = props.withTime ? `${base}T${timeString.value}` : base;
  // Keep the popover text in sync with the calendar pick
  textDraft.value = props.withTime ? next.replace("T", " ") : base;
  textError.value = "";
  emit("update:modelValue", next);
  if (!props.withTime) open.value = false;
}

function updateTime() {
  if (props.withTime && committedDateValue.value) updateFromCalendar(committedDateValue.value);
  else if (props.withTime && parsedTextValue.value) updateFromCalendar(parsedTextValue.value);
}

function clear() {
  textDraft.value = "";
  textError.value = "";
  emit("update:modelValue", undefined);
  open.value = false;
}

const display = computed(() => {
  if (!props.modelValue) return "";
  return props.withTime ? props.modelValue.replace("T", " ") : props.modelValue;
});

// --- Text entry: lets users type dates directly instead of using the calendar.
const textDraft = ref("");
const textError = ref("");
const textFocused = ref(false);

// Try to parse whatever is currently typed; returns undefined if empty/invalid.
function tryParseDraft(): DateValue | undefined {
  const raw = textDraft.value.trim();
  if (!raw) return undefined;
  try {
    if (props.withTime) {
      const normalized = raw.replace(" ", "T");
      // Accept YYYY-MM-DD or YYYY-MM-DDTHH:mm
      if (normalized.includes("T")) {
        const [datePart, timePart] = normalized.split("T");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined;
        // Validate date part
        parseDate(datePart);
        if (timePart && /^\d{2}:\d{2}/.test(timePart)) {
          const [h, m] = timePart.split(":").map(Number);
          if (h > 23 || m > 59) return undefined;
          return parseDateTime(`${datePart}T${timePart}`);
        }
        if (timePart && timePart.length > 0) return undefined; // malformed time
        return parseDateTime(`${datePart}T${timeString.value}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
      parseDate(normalized);
      return parseDateTime(`${normalized}T${timeString.value}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) return undefined;
    return parseDate(raw.slice(0, 10));
  } catch {
    return undefined;
  }
}

// Calendar should follow the draft text when valid, else the committed value.
// When both are invalid/empty, return undefined -> calendar defaults to today.
const parsedTextValue = computed<DateValue | undefined>(() => tryParseDraft());
const effectiveCalendarValue = computed<DateValue | undefined>(() => parsedTextValue.value ?? committedDateValue.value);

// Keep timeString in sync when the draft contains a time
watch(
  () => textDraft.value,
  (raw) => {
    if (!props.withTime) return;
    const m = raw.trim().replace(" ", "T").match(/T(\d{2}):(\d{2})/);
    if (m) timeString.value = `${m[1]}:${m[2]}`;
  },
);

// Sync draft from committed value (but don't clobber while typing)
watch(
  () => props.modelValue,
  () => {
    if (!textFocused.value) {
      textDraft.value = display.value;
      textError.value = "";
    }
  },
  { immediate: true },
);

function applyText() {
  const raw = textDraft.value.trim();
  if (!raw) {
    textError.value = "";
    return;
  }
  const parsed = tryParseDraft();
  if (!parsed) {
    textError.value = "Unrecognized date";
    return;
  }
  // Keep timeString in sync if a time was typed
  if (props.withTime && parsed instanceof CalendarDateTime) {
    timeString.value = `${pad(parsed.hour)}:${pad(parsed.minute)}`;
  }
  textError.value = "";
  // Normalize the draft (e.g. pad, ensure format)
  const base = `${pad(parsed.year)}-${pad(parsed.month)}-${pad(parsed.day)}`;
  const next =
    props.withTime && parsed instanceof CalendarDateTime
      ? `${base}T${pad(parsed.hour)}:${pad(parsed.minute)}`
      : base;
  textDraft.value = props.withTime ? next.replace("T", " ") : base;
  emit("update:modelValue", next);
  if (!props.withTime) open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        :id="id"
        variant="outline"
        :disabled="disabled"
        class="w-full justify-start font-normal"
        :class="!modelValue && 'text-muted-foreground'"
      >
        <CalendarIcon class="mr-1 size-4" />
        {{ display || placeholder }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" align="start">
      <div class="flex items-center gap-2 border-b p-2">
        <Input
          v-model="textDraft"
          :placeholder="withTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'"
          class="h-8 text-xs"
          @focus="textFocused = true"
          @blur="textFocused = false"
          @keydown.enter.prevent="applyText"
        />
        <Button variant="secondary" size="sm" @click="applyText">Set</Button>
      </div>
      <p v-if="textError" class="px-3 py-1 text-xs text-destructive">{{ textError }}</p>
      <Calendar
        :model-value="effectiveCalendarValue"
        :placeholder="effectiveCalendarValue"
        :default-placeholder="effectiveCalendarValue"
        calendar-label="Date"
        :minute-increment="5"
        @update:model-value="updateFromCalendar"
      />
      <div v-if="withTime" class="flex items-center gap-3 border-t p-3">
        <div class="flex flex-col gap-1">
          <Label for="picker-time" class="text-xs text-muted-foreground">Time</Label>
          <Input id="picker-time" v-model="timeString" type="time" class="w-28" @change="updateTime" />
        </div>
        <Button variant="ghost" size="sm" class="ml-auto" @click="clear">Clear</Button>
      </div>
      <div v-else class="flex justify-end border-t p-2">
        <Button variant="ghost" size="sm" @click="clear">Clear</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
