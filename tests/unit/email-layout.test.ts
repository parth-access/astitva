import { describe, expect, it } from "vitest";
import { emailImage, esc, pieces, progress, shell } from "@/modules/email/layout";
import { renderPasswordReset } from "@/modules/email/templates";

describe("email layout", () => {
  it("escapes everything that came from a person", () => {
    const { html } = renderPasswordReset({ name: `<img src=x onerror="alert(1)">`, url: "https://astitva.test/r?a=1&b=2", appUrl: "https://astitva.test" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('href="https://astitva.test/r?a=1&amp;b=2"');
    expect(esc(`it's "<b>"`)).toBe("it&#39;s &quot;&lt;b&gt;&quot;");
  });

  it("keeps order markup inside its script tag", () => {
    const html = shell({ appUrl: "https://astitva.test", preheader: "p", title: "t", body: "", jsonLd: { name: "</script><script>alert(1)</script>" } });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain("\\u003c/script>");
  });

  it("asks Cloudinary for a JPEG at twice the size, and leaves other images alone", () => {
    expect(emailImage("https://res.cloudinary.com/demo/image/upload/v1/astitva/pieces/a.png", 72, 90)).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_144,h_180,q_auto,f_jpg/v1/astitva/pieces/a.png",
    );
    expect(emailImage("https://example.com/a.webp", 72, 90)).toBe("https://example.com/a.webp");
  });

  it("marks the steps done, the current one, and the rest", () => {
    const html = progress(["Placed", "Confirmed", "Packed"], 1);
    expect(html).toContain("&#10003;&nbsp;Placed");
    expect(html.indexOf("font-weight:600")).toBeLessThan(html.indexOf(">Confirmed<"));
    expect(html).not.toContain("&#10003;&nbsp;Packed");
  });

  it("paints a piece without a photo in its colour, with its name", () => {
    const html = pieces([{ title: "Neem", number: "Nº 01", detail: "Linen wrap dress · Sage, S", price: "₹3,499", photo: null, tone: "#8a8f6a", url: null }]);
    expect(html).toContain("background:#8a8f6a");
    expect(html).toContain(">Neem</td>");
  });
});
