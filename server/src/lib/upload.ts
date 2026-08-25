import multer from "multer";

/**
 * Shared image upload config.
 *
 * 4MB rather than the previous 10MB: Lambda's synchronous payload ceiling is
 * 6MB, and base64-encoding a multipart body inflates it by roughly a third, so
 * anything above ~4.5MB is rejected by the platform before the handler runs.
 * The client downscales to 1200px/q0.82 first, which lands well under this —
 * the limit exists to produce a clean error for anything that slips past.
 */
export const uploadImageField = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
}).single("image");
