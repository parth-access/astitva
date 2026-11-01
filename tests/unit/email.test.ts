import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "../../src/lib/email";

describe("sending through Resend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes the idempotency key on, so a retried send can't arrive twice", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push(init);
      return Response.json({ id: "email_1" });
    });
    const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Astitva <hello@astitva.test>" };
    await sendEmail({ to: "asha@example.com", subject: "Hi", text: "Hello", idempotencyKey: "outbox-1" }, env);
    await sendEmail({ to: "asha@example.com", subject: "Hi", text: "Hello" }, env);
    expect((calls[0]!.headers as Record<string, string>)["idempotency-key"]).toBe("outbox-1");
    expect(calls[1]!.headers).not.toHaveProperty("idempotency-key");
    expect(JSON.parse(String(calls[0]!.body))).not.toHaveProperty("idempotencyKey");
  });

  it("sends replies to the address it's given, and sets none without one", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({ id: "email_1" });
    });
    const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Astitva <hello@astitva.test>" };
    await sendEmail({ to: "asha@example.com", subject: "Hi", text: "Hello", replyTo: "help@astitva.test" }, env);
    await sendEmail({ to: "asha@example.com", subject: "Hi", text: "Hello" }, env);
    expect(bodies[0]!.reply_to).toBe("help@astitva.test");
    expect(bodies[1]).not.toHaveProperty("reply_to");
  });
});
