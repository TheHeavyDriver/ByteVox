"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_IMPORT_LIMITS, importCsvBytes } from "@/lib/csv/importer";
import {
  deleteDataset,
  deriveDatasetName,
  persistDataset,
  renameDataset,
  saveDatasetFile,
} from "@/lib/datasets";
import { getCurrentUser } from "@/lib/session";

export type UploadState = { error: string | null };

function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? "10");
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadDatasetAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired. Sign in and try again." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }

  const maxBytes = maxUploadBytes();
  if (file.size > maxBytes) {
    return {
      error: `The file is ${megabytes(file.size)}; the limit is ${megabytes(maxBytes)}.`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const outcome = await importCsvBytes(bytes, {
    ...DEFAULT_IMPORT_LIMITS,
    maxBytes,
  });
  if (!outcome.ok) {
    return { error: outcome.error.message };
  }

  // The original bytes are kept on disk (random file name, never served
  // back) so deleting a dataset frees real space.
  const storagePath = await saveDatasetFile(bytes);
  const dataset = await persistDataset({
    userId: user.id,
    name: deriveDatasetName(file.name),
    originalFilename: file.name,
    storagePath,
    byteSize: file.size,
    result: outcome.result,
  });

  revalidatePath("/dashboard");
  redirect(`/datasets/${dataset.id}`);
}

const renameSchema = z.object({
  datasetId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be blank.")
    .max(80, "Name cannot exceed 80 characters."),
});

export async function renameDatasetAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = renameSchema.safeParse({
    datasetId: formData.get("datasetId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return;

  const updated = await renameDataset(
    parsed.data.datasetId,
    user.id,
    parsed.data.name,
  );
  if (updated) {
    revalidatePath("/dashboard");
    revalidatePath(`/datasets/${parsed.data.datasetId}`);
  }
}

export async function deleteDatasetAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const datasetId = String(formData.get("datasetId") ?? "");
  if (!datasetId) return;

  await deleteDataset(datasetId, user.id);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
