/**
 * Field definitions shared by the piece editor (browser) and its validation
 * (server). No imports, so nothing server-side reaches the browser bundle.
 */
type MeasurementKey = "bustCm" | "waistCm" | "hipCm" | "lengthCm" | "shoulderCm" | "sleeveCm";

export const CONDITIONS = ["new_with_tags", "new", "like_new", "gently_used"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<Condition, string> = {
  new_with_tags: "New with tags",
  new: "New, no tags",
  like_new: "Like new",
  gently_used: "Gently used",
};

export const MEASUREMENT_FIELDS = [
  ["bustCm", "Bust"],
  ["waistCm", "Waist"],
  ["hipCm", "Hip"],
  ["lengthCm", "Length"],
  ["shoulderCm", "Shoulder"],
  ["sleeveCm", "Sleeve"],
] as const satisfies readonly (readonly [MeasurementKey, string])[];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Neem", "Olive linen wrap dress" → "neem-olive-linen-wrap-dress". */
export function slugify(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/, "");
}
