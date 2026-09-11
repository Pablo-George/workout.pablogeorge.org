import { writeFileSync, mkdirSync } from "fs";
import { unlink } from "fs/promises";
import { basename, join } from "path";
import crypto from "crypto";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

// Relative to process.cwd(), matching app.ts's `express.static("./data/uploads")` —
// not to this module's own (compiled) location. In production the process runs
// from /app while the compiled file lives under /app/server/dist/services, so a
// module-relative path here landed uploads in a directory nothing served or
// persisted, and every uploaded image 404'd.
const UPLOADS_DIR = join(process.cwd(), "data", "uploads");

export async function uploadImage(file: Express.Multer.File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    throw new Error("Only JPEG, PNG, GIF, and WebP images are allowed.");
  }

  mkdirSync(UPLOADS_DIR, { recursive: true });

  const ext = EXTENSIONS[file.mimetype] || "";
  const filename = `${crypto.randomUUID()}${ext}`;
  writeFileSync(join(UPLOADS_DIR, filename), file.buffer);

  return `/uploads/${filename}`;
}

/** Deletes only files created in our local uploads directory. Remote URLs and
 * traversal-like paths are deliberately ignored. */
export async function deleteImage(imageUrl: string | null): Promise<void> {
  if (!imageUrl?.startsWith("/uploads/")) return;
  const filename = basename(imageUrl);
  if (`/uploads/${filename}` !== imageUrl) return;
  try {
    await unlink(join(UPLOADS_DIR, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // The post is already gone at this point; a filesystem cleanup failure
      // should not leave the browser waiting forever on an Express 4 promise.
      console.error("Failed to delete post image:", error);
    }
  }
}
