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
    `Create a clear exercise form guide infographic for the gym exercise: ${liftName}.
Show 3-4 numbered steps illustrating the full movement (start, mid, end positions).
Include brief coaching cues as short labels (e.g. "brace core", "chest up", "controlled descent").
Style: dark background, clean modern fitness aesthetic, white text, blue accents. Portrait layout.`
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
