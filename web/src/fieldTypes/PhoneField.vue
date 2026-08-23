<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  COUNTRY_CODES,
  type CountryCode,
  parseStoredPhone,
} from "./countryCodes";

interface Props {
  modelValue: string;
  field: {
    name: string;
    label: string;
    isRequired: boolean;
  };
  disabled?: boolean;
  id: string;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

/** Current selected country */
const country = ref<CountryCode>(COUNTRY_CODES[0]);

/** National number (without country code) */
const national = ref("");

/** Parse stored value on init / modelValue change */
function parseValue() {
  const parsed = parseStoredPhone(props.modelValue);
  if (parsed) {
    const found = COUNTRY_CODES.find((c) => c.dialCode === parsed.dialCode) || COUNTRY_CODES[0];
    country.value = found;
    national.value = parsed.national;
  } else if (props.modelValue) {
    // Fallback: treat as national number with default country
    national.value = props.modelValue.replace(/\D/g, "");
  } else {
    national.value = "";
  }
}

watch(
  () => props.modelValue,
  () => parseValue(),
  { immediate: true },
);

/** Combine dial code + national for storage */
function buildStoredValue(): string {
  const clean = national.value.replace(/\D/g, "");
  if (!clean) return "";
  return `${country.value.dialCode}${clean}`;
}

/** Validate length for selected country */
function validate(): string | null {
  const clean = national.value.replace(/\D/g, "");
  if (props.field.isRequired && !clean) return "Phone number is required";
  const { minLength, maxLength } = country.value;
  if (clean && (clean.length < (minLength || 0) || clean.length > (maxLength || 15))) {
    return `Phone number must be ${minLength}-${maxLength} digits for ${country.value.name}`;
  }
  return null;
}

function onNationalChange(val: string | number) {
  national.value = String(val);
  emit("update:modelValue", buildStoredValue());
}

function onCountryChange(newDialCode: unknown) {
  const dialCode = String(newDialCode);
  const found = COUNTRY_CODES.find((c) => c.dialCode === dialCode);
  if (found) country.value = found;
  emit("update:modelValue", buildStoredValue());
}

const error = computed(() => validate());

/** Placeholder text for the national number input. */
const phonePlaceholder = computed(() =>
  country.value.name === "United States" ? "555 123 4567" : "National number",
);
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="`${id}-phone`">{{ field.label }}</Label>
    <div class="flex gap-2">
      <Select
        :id="`${id}-country`"
        :model-value="country.dialCode"
        @update:modelValue="onCountryChange"
        :disabled="disabled"
      >
        <SelectTrigger class="w-[72px] shrink-0 h-9 px-2 min-w-0 justify-center">
          <span class="font-mono text-xs">{{ country.dialCode }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="c in COUNTRY_CODES"
            :key="c.code"
            :value="c.dialCode"
          >
            <span class="flex items-center gap-2">
              <span v-if="c.flag">{{ c.flag }}</span>
              <span class="truncate">{{ c.name }}</span>
              <span class="text-muted-foreground ml-auto">{{ c.dialCode }}</span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <div class="flex-1 min-w-0">
      <Input
        :id="`${id}-phone`"
        :modelValue="national"
        @update:modelValue="onNationalChange"
          :placeholder="phonePlaceholder"
          :disabled="disabled"
          class="w-full"
          type="tel"
          inputmode="numeric"
          maxlength="10"
        />
      </div>
    </div>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
  </div>
</template>