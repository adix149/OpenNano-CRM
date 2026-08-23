/**
 * ISO 3166-1 alpha-2 country codes with dialing codes.
 * Subset covering major countries; extend as needed.
 */
export interface CountryCode {
  code: string;      // ISO 3166-1 alpha-2 (e.g. "US")
  name: string;      // Country name
  dialCode: string;  // International dialing code (e.g. "+1")
  flag?: string;     // Emoji flag (optional)
  minLength?: number; // Min national number length
  maxLength?: number; // Max national number length
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸", minLength: 10, maxLength: 10 },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧", minLength: 10, maxLength: 10 },
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳", minLength: 10, maxLength: 10 },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦", minLength: 10, maxLength: 10 },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺", minLength: 10, maxLength: 10 },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪", minLength: 10, maxLength: 10 },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷", minLength: 10, maxLength: 10 },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵", minLength: 10, maxLength: 10 },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳", minLength: 10, maxLength: 10 },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷", minLength: 10, maxLength: 10 },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽", minLength: 10, maxLength: 10 },
  { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸", minLength: 10, maxLength: 10 },
  { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹", minLength: 10, maxLength: 10 },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱", minLength: 10, maxLength: 10 },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬", minLength: 10, maxLength: 10 },
  { code: "AE", name: "UAE", dialCode: "+971", flag: "🇦🇪", minLength: 10, maxLength: 10 },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦", minLength: 10, maxLength: 10 },
  { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦", minLength: 10, maxLength: 10 },
  { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬", minLength: 10, maxLength: 10 },
  { code: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪", minLength: 10, maxLength: 10 },
];

export function findCountryByCode(code: string): CountryCode | undefined {
  return COUNTRY_CODES.find((c) => c.code === code);
}

export function findCountryByDialCode(dialCode: string): CountryCode | undefined {
  return COUNTRY_CODES.find((c) => c.dialCode === dialCode);
}

export function getDefaultCountry(): CountryCode {
  return COUNTRY_CODES[0]; // US as default
}

/**
 * Formats a phone number for display: +CC NNN NNN NNNN
 */
export function formatPhoneForDisplay(dialCode: string, national: string): string {
  const clean = national.replace(/\D/g, "");
  return `${dialCode} ${clean}`;
}

/**
 * Parses a stored phone value (e.g. "+15551234567") into dialCode + national.
 * Stored format: "+CCNNNNNNNNNN" (dial code + national number, no spaces)
 */
export function parseStoredPhone(value: string): { dialCode: string; national: string } | null {
  if (!value || !value.startsWith("+")) return null;
  for (const country of COUNTRY_CODES) {
    if (value.startsWith(country.dialCode)) {
      return { dialCode: country.dialCode, national: value.slice(country.dialCode.length) };
    }
  }
  // Fallback: assume first 1-3 digits after + is country code
  const match = value.match(/^\+(\d{1,3})(\d+)$/);
  if (match) return { dialCode: "+" + match[1], national: match[2] };
  return null;
}