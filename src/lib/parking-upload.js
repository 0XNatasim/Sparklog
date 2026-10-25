// Parcomètre receipts of a job (migration 0095): every picked picture is uploaded, then the ONE claim
// row of the job is written (total amount, first picture + extras) with its manager notification.
import { prepareEvidenceImage, isFileFailure } from "@/lib/evidence-file";
import { reportFileReadError } from "@/lib/file-read-report";
import { withTimeout } from "@/lib/utils";
import { PARKING_BUCKET, mergeParkingPaths, orderPickedFiles, parkingReceiptPaths, parkingStoragePath } from "@/lib/parking-receipts";

// "add" keeps the pictures already saved, "replace" starts over. A failure before the claim row is
// written removes the pictures just uploaded (no orphan). Returns the number of pictures of the claim.
// `tooManyMessage` is the (translated) error when the claim would hold more than the maximum.
export async function uploadParkingReceipt(client, { userId, jobId, jobDate, files, amount, mode = "add", tooManyMessage }) {
  const uploaded = [];
  const removeUploaded = () => (uploaded.length
    ? client.storage.from(PARKING_BUCKET).remove(uploaded).catch(() => undefined)
    : Promise.resolve());
  let paths;
  try {
    // Every call is timed out so a bad connection surfaces a retryable error instead of
    // freezing the save button forever.
    for (const file of orderPickedFiles(files)) {
      const storagePath = parkingStoragePath(userId, jobDate, crypto.randomUUID());
      let image;
      try {
        image = await prepareEvidenceImage(file);
      } catch (error) {
        if (isFileFailure(error)) reportFileReadError("parking", file, error);
        throw error;
      }
      const { error: uploadError } = await withTimeout(
        client.storage.from(PARKING_BUCKET).upload(storagePath, image, { contentType: "image/jpeg", upsert: false }),
        20000
      );
      if (uploadError) throw uploadError;
      uploaded.push(storagePath);
    }
    let existing = [];
    if (mode === "add") {
      const { data: current, error: currentError } = await withTimeout(
        client.from("parking_receipts").select("storage_path, extra_storage_paths").eq("job_id", jobId).maybeSingle(),
        10000
      );
      if (currentError) throw currentError;
      existing = parkingReceiptPaths(current);
    }
    paths = mergeParkingPaths(existing, uploaded, mode);
    if (!paths) throw new Error(tooManyMessage);
  } catch (error) {
    await removeUploaded();
    throw error;
  }

  const { data: savedReceipt, error: receiptError } = await withTimeout(
    client.from("parking_receipts").upsert({
      job_id: jobId,
      user_id: userId,
      job_date: jobDate,
      ...paths,
      amount,
    }, { onConflict: "job_id" }).select("id").single(),
    12000
  );
  if (receiptError) {
    await removeUploaded();
    throw receiptError;
  }
  const { error: notificationError } = await withTimeout(
    client.from("manager_notifications").insert({
      type: "parking_receipt",
      employee_id: userId,
      job_id: jobId,
      parking_receipt_id: savedReceipt.id,
      daily_minutes: 0,
    }),
    12000
  );
  if (notificationError) throw notificationError;
  return 1 + paths.extra_storage_paths.length;
}
