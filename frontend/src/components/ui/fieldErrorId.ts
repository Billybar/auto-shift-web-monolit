// src/components/ui/fieldErrorId.ts

/** The id of a FormField's error text; point the control's aria-describedby at it. */
export const fieldErrorId = (htmlFor: string): string => `${htmlFor}-error`;
