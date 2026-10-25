import { parsePhoneNumberFromString } from "libphonenumber-js";

/** E.164 for a typed number, US by default; null when it is not a valid number. */
export function normalizePhone(input: string): string | null {
  const n = parsePhoneNumberFromString(input.trim(), "US");
  return n && n.isValid() ? n.number : null;
}

/** True for a +1 number that belongs to the US (not Canada or the Caribbean). Only these are texted. */
export function isUsNumber(e164: string): boolean {
  const n = parsePhoneNumberFromString(e164);
  return !!n && n.isValid() && n.countryCallingCode === "1" && n.country === "US";
}

/** True when the typed number is outside the US: another country code, or a +1 number that isn't American. */
export function isForeignNumber(input: string): boolean {
  const n = parsePhoneNumberFromString(input.trim(), "US");
  if (!n) return false;
  return n.countryCallingCode !== "1" || (n.isValid() && !isUsNumber(n.number));
}
