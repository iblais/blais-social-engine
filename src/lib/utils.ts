import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a Supabase/Postgres timestamp string to a JavaScript Date in the user's local timezone.
 * Supabase returns '2026-03-10 21:48:00+00' (space separator, truncated offset).
 * This is non-standard and some browsers ignore the +00 timezone, displaying UTC time as local.
 * Fix: normalize to ISO 8601 '2026-03-10T21:48:00+00:00' before parsing.
 */
export function parseDate(str: string | null | undefined): Date {
  if (!str) return new Date(NaN);
  const iso = str.replace(' ', 'T').replace(/([+-]\d{2})(:\d{2})?$/, '$1:00');
  return new Date(iso);
}
