import { attachPhotosAction, signPhotoUploadAction } from "@/app/admin/(panel)/pieces/actions";
import type { SignedUpload, UploadReceipt } from "@/modules/media/cloudinary";
import type { PanelPhoto } from "./photos-panel";
import { eachAtOnce, uploadToCloudinary } from "./upload";

/** Photos of one piece and colour (null: every colour), in the order they should show. */
export type PhotoGroup = { productId: string; colour: string | null; files: File[] };

/** Uploads at once: enough to keep a home connection busy, few enough that each still moves. */
const AT_ONCE = 4;
/** Cloudinary takes a signature for an hour; a fresh one is asked for well before. */
const SIGNATURE_LIFE = 45 * 60 * 1000;

/**
 * Photos for one or many pieces: every file goes to Cloudinary through one
 * shared set of lanes (so a colour with two photos doesn't hold up the next),
 * under one signature, then all are recorded in a single call, in the order
 * chosen, however the uploads finish. Results come back per group.
 */
export async function uploadPhotoGroups(groups: PhotoGroup[], report: (progress: string) => void) {
  const jobs = groups.flatMap((g, group) => g.files.map((file) => ({ file, group })));
  const total = jobs.length;
  const say = (sent: number) => report(total > 1 ? `Uploading ${Math.min(sent + 1, total)} of ${total}…` : "Uploading…");
  say(0);

  // One signature for the batch, shared by the lanes; the server is asked again only once it's old.
  let signed: { at: number; upload: Promise<SignedUpload> } | null = null;
  const sign = () => {
    if (!signed || Date.now() - signed.at > SIGNATURE_LIFE) {
      const upload = signPhotoUploadAction(groups[0]!.productId);
      signed = { at: Date.now(), upload };
      upload.catch(() => (signed = null)); // a failed ask isn't kept for the next photo
    }
    return signed.upload;
  };

  const uploads = await eachAtOnce(jobs, AT_ONCE, (job) => uploadToCloudinary(job.file, sign), say);

  report("Saving…");
  const results = groups.map(() => ({ added: [] as PanelPhoto[], problems: [] as string[] }));
  const items: { productId: string; receipt: UploadReceipt; colour: string | null }[] = [];
  const itemJob: number[] = [];
  for (const [i, up] of uploads.entries()) {
    const job = jobs[i]!;
    if (!up.ok) {
      results[job.group]!.problems.push(up.error instanceof Error ? up.error.message : `${job.file.name}: upload failed.`);
      continue;
    }
    itemJob.push(i);
    items.push({ productId: groups[job.group]!.productId, receipt: up.value, colour: groups[job.group]!.colour });
  }
  if (items.length) {
    try {
      const saved = await attachPhotosAction(items);
      const jobOf = (index: number) => jobs[itemJob[index]!]!;
      for (const { index, productId, ...photo } of saved.photos) if (productId) results[jobOf(index).group]!.added.push(photo);
      for (const { index, error } of saved.problems) results[jobOf(index).group]!.problems.push(`${jobOf(index).file.name}: ${error}`);
    } catch {
      for (const i of itemJob) results[jobs[i]!.group]!.problems.push(`${jobs[i]!.file.name}: uploaded, but couldn't be saved. Try again.`);
    }
  }
  return results;
}

/** A piece's new photos of one colour (null: every colour). */
export async function uploadPhotos(productId: string, files: File[], colour: string | null, report: (progress: string) => void) {
  const [result] = await uploadPhotoGroups([{ productId, colour, files }], report);
  return result!;
}
