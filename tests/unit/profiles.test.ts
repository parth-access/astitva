import { describe, expect, it } from "vitest";
import { parseSettingsForm } from "../../src/modules/catalog-admin/settings";
import { cleanProfileLink, profileLabel } from "../../src/lib/profiles";

describe("profiles elsewhere", () => {
  it("names a profile by its site and handle", () => {
    expect(profileLabel("https://www.instagram.com/shop.astitva/")).toBe("Instagram @shop.astitva");
    expect(profileLabel("https://in.pinterest.com/astitva")).toBe("Pinterest @astitva");
    expect(profileLabel("https://www.youtube.com/@astitva")).toBe("YouTube @astitva");
    expect(profileLabel("https://www.linkedin.com/company/astitva")).toBe("LinkedIn");
    expect(profileLabel("https://example.org/astitva")).toBe("example.org");
  });

  it("drops the tracking an app adds when a profile is shared", () => {
    expect(cleanProfileLink("https://www.instagram.com/shop.astitva?utm_source=ig_web_button_share_sheet&igsh=abc")).toBe("https://www.instagram.com/shop.astitva");
    const f = new FormData();
    for (const [k, v] of Object.entries({ note: "", supportWhatsapp: "", shippingFlatMinor: "0", profileLinks: "https://www.instagram.com/shop.astitva?igsh=1\nhttps://www.instagram.com/shop.astitva" })) f.append(k, v);
    const parsed = parseSettingsForm(f);
    expect(parsed.ok && parsed.data.profileLinks).toEqual(["https://www.instagram.com/shop.astitva"]);
  });

  it("keeps the About page's paragraphs as typed, without Windows line ends", () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ note: "", supportWhatsapp: "", shippingFlatMinor: "0", profileLinks: "", aboutIntro: " Your true form ", aboutBody: "One.\r\n\r\nTwo.\r\n" })) f.append(k, v);
    const parsed = parseSettingsForm(f);
    expect(parsed.ok && parsed.data.aboutIntro).toBe("Your true form");
    expect(parsed.ok && parsed.data.aboutBody).toBe("One.\n\nTwo.");
  });
});
