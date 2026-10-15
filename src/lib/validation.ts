import { z } from "zod";

/**
 * Shared server-side validation schemas. Imported by server actions and by
 * tests, so they contain no Next.js imports.
 */

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters long.");
