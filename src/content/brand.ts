/**
 * Brand copy that makes a promise to customers. Each entry is a DRAFT until
 * Krishna confirms the business actually does it; flip `confirmed` then.
 * Unconfirmed promises render in development (or with SHOW_DRAFT_COPY=1)
 * so the design can be reviewed, and are hidden in production builds.
 */
export type BrandPromise = { title: string; body: string; confirmed: boolean };

export const PACKED_BY_HAND: BrandPromise = {
  title: "Packed by hand",
  body: "Every piece leaves wrapped by hand, with a card bearing its number and name.",
  confirmed: true,
};

export function showPromise(p: BrandPromise) {
  return p.confirmed || process.env.NODE_ENV !== "production" || process.env.SHOW_DRAFT_COPY === "1";
}
