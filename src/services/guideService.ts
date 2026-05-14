import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "node:crypto";

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, "../../data/uploads");

export async function generateGuideImage(liftName: string): Promise<string> {
  const response = await ai.generate({
    model: "googleai/imagen-3.0-generate-002",
    prompt: `Professional exercise form guide infographic for: ${liftName}.
Show 3 clear phases with stick-figure or diagram style illustrations: starting position, mid-movement, and lockout/end position.
Include brief form cues as short text labels (e.g. "brace core", "chest up", "full depth").
Dark background (#0f0f0f), clean modern fitness aesthetic, white text, blue (#4f9eff) accents for key cues.
Portrait layout, no watermarks, no logos.`,
    config: {
      aspectRatio: "9:16",
      numberOfImages: 1,
    } as any,
  });

  const media = (response as any).media as { url: string; contentType?: string } | undefined;
  if (!media?.url) throw new Error("No image in Imagen response");

  const base64 = media.url.split(",")[1];
  const mimeType = media.contentType ?? "image/png";
  const ext = mimeType.includes("jpeg") ? ".jpg" : ".png";

  mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `guide-${crypto.randomUUID()}${ext}`;
  writeFileSync(join(UPLOADS_DIR, filename), Buffer.from(base64, "base64"));

  return `/uploads/${filename}`;
}
