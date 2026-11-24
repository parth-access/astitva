import { beforeEach, expect, test, vi } from "vitest";

const sign = vi.fn();
const attach = vi.fn();
vi.mock("@/app/admin/(panel)/pieces/actions", () => ({ signPhotoUploadAction: sign, attachPhotosAction: attach }));
vi.mock("@/components/admin/upload", async (real) => ({
  ...(await real<typeof import("@/components/admin/upload")>()),
  // Later files finish first, so order can't come from finishing order.
  uploadToCloudinary: async (file: File, signer: () => Promise<unknown>) => {
    await signer();
    if (file.name === "bad.jpg") throw new Error("bad.jpg is over 10 MB.");
    await new Promise((r) => setTimeout(r, 50 - Number(file.name.replace(/\D/g, "") || 0) * 5));
    return { public_id: file.name };
  },
}));

const { uploadPhotoGroups } = await import("@/components/admin/upload-photos");
const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

beforeEach(() => {
  sign.mockReset().mockResolvedValue({ url: "u", fields: {} });
  attach.mockReset().mockImplementation(async (items: { productId: string; receipt: { public_id: string } }[]) => ({
    photos: items.map((it, index) => ({ index, productId: it.productId, id: it.receipt.public_id, url: it.receipt.public_id })),
    problems: [],
  }));
});

test("many pieces: one signature, one save, photos in the order chosen and back to their own piece", async () => {
  const results = await uploadPhotoGroups(
    [
      { productId: A, colour: "Cream", files: [file("1.jpg"), file("2.jpg"), file("3.jpg")] },
      { productId: B, colour: null, files: [file("4.jpg"), file("bad.jpg"), file("5.jpg")] },
    ],
    () => {},
  );
  expect(sign).toHaveBeenCalledTimes(1);
  expect(attach).toHaveBeenCalledTimes(1);
  expect(attach.mock.calls[0][0].map((i: { receipt: { public_id: string } }) => i.receipt.public_id)).toEqual(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"]);
  expect(results[0]!.added.map((p) => p.id)).toEqual(["1.jpg", "2.jpg", "3.jpg"]);
  expect(results[1]!.added.map((p) => p.id)).toEqual(["4.jpg", "5.jpg"]);
  expect(results[1]!.problems).toEqual(["bad.jpg is over 10 MB."]);
});

test("a photo the server refuses is reported against its own file", async () => {
  attach.mockResolvedValueOnce({ photos: [], problems: [{ index: 1, error: "This piece no longer exists." }] });
  const [r] = await uploadPhotoGroups([{ productId: A, colour: null, files: [file("1.jpg"), file("2.jpg")] }], () => {});
  expect(r!.problems).toEqual(["2.jpg: This piece no longer exists."]);
});
