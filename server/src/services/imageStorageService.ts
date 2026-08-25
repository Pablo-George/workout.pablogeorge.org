import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
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

const UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../data/uploads");

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
