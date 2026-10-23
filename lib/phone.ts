import { parsePhoneNumberFromString } from "libphonenumber-js";

/** E.164 for a typed number, US by default; null when it is not a valid number. */
export function normalizePhone(input: string): string | null {
  const n = parsePhoneNumberFromString(input.trim(), "US");
  return n && n.isValid() ? n.number : null;
}
