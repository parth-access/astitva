import { describe, expect, it } from "vitest";
import { GUIDES, guideBySlug } from "../../src/content/guides";
import { articleLd } from "../../src/lib/seo";

describe("styling guides", () => {
  it("each has a unique address, a search description that fits, and words in every section", () => {
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      expect(g.slug).toMatch(/^[a-z0-9-]+$/);
      expect(g.description.length).toBeLessThanOrEqual(160);
      expect(g.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const s of g.sections) expect(s.paragraphs.join("").length).toBeGreaterThan(80);
    }
    expect(guideBySlug("nope")).toBeNull();
  });

  it("describes a guide as an article by the shop", () => {
    const g = GUIDES[0];
    const ld = articleLd({ ...g, path: `/guides/${g.slug}`, image: null }) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Article");
    expect(ld.headline).toBe(g.title);
    expect(ld.author).toEqual(ld.publisher);
    expect(ld).not.toHaveProperty("image");
  });
});
