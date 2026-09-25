import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "../env";

/**
 * Object storage behind a narrow interface.
 *
 * The local adapter writes under STORAGE_DIR and is what runs in development.
 * Swapping in S3/GCS means implementing these four methods against the SDK —
 * callers only ever see a storage key, never a path.
 */
export interface ObjectStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const root = resolve(process.cwd(), env.storageDir);

/** Rejects any key that would escape the storage root. */
function pathFor(key: string): string {
  const target = resolve(join(root, key));
  if (!target.startsWith(root + "/") && target !== root) {
    throw new Error("Invalid storage key");
  }
  return target;
}

export const localStorage: ObjectStorage = {
  async put(key, data) {
    const target = pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  },
  async get(key) {
    return readFile(pathFor(key));
  },
  async remove(key) {
    await unlink(pathFor(key)).catch(() => undefined);
  },
  async exists(key) {
    return stat(pathFor(key))
      .then(() => true)
      .catch(() => false);
  },
};

export const storage = localStorage;

/** Sharded by hash so one directory never holds a million files. */
export function storageKeyFor(attachmentId: string, fileName: string): string {
  const shard = createHash("sha256").update(attachmentId).digest("hex").slice(0, 2);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `${shard}/${attachmentId}-${safeName}`;
}

export function newAttachmentId(): string {
  return `att_${randomUUID()}`;
}
