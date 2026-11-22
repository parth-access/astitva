import { attachPhotoAction, signPhotoUploadAction } from "@/app/admin/(panel)/pieces/actions";
import type { PanelPhoto } from "./photos-panel";
import { eachAtOnce, uploadToCloudinary } from "./upload";

/**
 * A piece's new photos of one colour (null: every colour): sent to
 * Cloudinary three at a time, then recorded in the order chosen, so the
 * first file is the first photo however the uploads finish.
 */
export async function uploadPhotos(productId: string, files: File[], colour: string | null, report: (progress: string) => void) {
  let sent = 0;
  const say = () => report(files.length > 1 ? `Uploading ${Math.min(sent + 1, files.length)} of ${files.length}…` : "Uploading…");
  say();
  const uploads = await eachAtOnce(
    files,
    3,
    (file) => uploadToCloudinary(file, () => signPhotoUploadAction(productId)),
    (n) => {
      sent = n;
      say();
    },
  );
  report("Saving…");
  const added: PanelPhoto[] = [];
  const problems: string[] = [];
  for (const [i, up] of uploads.entries()) {
    try {
      if (!up.ok) throw up.error;
      const saved = await attachPhotoAction(productId, up.value, colour);
      if (!saved.ok) throw new Error(saved.error);
      added.push(saved.photo);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : `${files[i].name}: upload failed.`);
    }
  }
  return { added, problems };
}
