import { GoogleGenerativeAI } from "@google/generative-ai";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, "../../data/uploads");

export async function generateGuideImage(liftName: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    } as any,
  });

  const result = await model.generateContent(
    `Create a detailed, high-quality exercise form guide infographic for: ${liftName}.

Layout (portrait, dark background #0f0f0f):

1. TITLE at the top: "${liftName}" in large bold white text.

2. STEP-BY-STEP FORM section: 4-5 clearly numbered illustrations showing the full movement arc —
   starting position, descent/approach, key midpoint, lockout/finish, and return.
   Each step has a short bold label and 1-2 bullet cues (e.g. "feet shoulder-width", "knees track toes").

3. KEY COACHING CUES section: 5-6 concise technique reminders in a bulleted list
   (e.g. "Keep chest tall", "Drive through heels", "Bar over mid-foot", "Neutral spine throughout").

4. COMMON MISTAKES section: 3-4 red-highlighted mistakes to avoid
   (e.g. "❌ Rounding lower back", "❌ Knees caving in", "❌ Rising hips before chest").

5. MUSCLES WORKED at the bottom: small labeled diagram or list showing primary and secondary muscles.

Style: dark background, white primary text, blue (#4f9eff) accents for section headers,
red (#ef4444) for mistakes. Clean modern fitness app aesthetic. Dense but readable — pack in real detail.`
  );

  const parts = (result.response.candidates?.[0]?.content?.parts ?? []) as any[];
  const imagePart = parts.find((p: any) => p.inlineData);
  if (!imagePart?.inlineData) throw new Error("No image in response");

  const buffer = Buffer.from(imagePart.inlineData.data, "base64");
  const mimeType: string = imagePart.inlineData.mimeType ?? "image/png";
  const ext = mimeType.includes("jpeg") ? ".jpg" : ".png";

  mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `guide-${crypto.randomUUID()}${ext}`;
  writeFileSync(join(UPLOADS_DIR, filename), buffer);

  return `/uploads/${filename}`;
}
