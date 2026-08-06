import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/googleai";

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
});

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.cause?.status;
      if (status !== 503 && status !== 429) throw err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

const CalEstimateSchema = z.object({
  description: z.string(),
  calories: z.number().int(),
  proteinG: z.number().int(),
  carbsG: z.number().int(),
  breakdown: z.array(
    z.object({
      item: z.string(),
      calories: z.number().int(),
      proteinG: z.number().int(),
      carbsG: z.number().int(),
    })
  ),
});

const NUTRITION_INSTRUCTIONS = `Return:
- description: brief label for this meal (e.g. "Chicken breast with rice and broccoli")
- calories: total estimated calories as a single integer
- proteinG: total estimated protein in grams as a single integer
- carbsG: total estimated carbohydrates in grams as a single integer
- breakdown: each distinct food item with its individual calories, proteinG, and carbsG estimates`;

export async function estimateCalories(buffer: Buffer, mimeType: string, context?: string) {
  const contextNote = context ? `\n\nAdditional context from the user: ${context}` : "";
  const { output } = await withRetry(() => ai.generate({
    model: "googleai/gemini-2.5-flash",
    prompt: [
      {
        media: {
          url: `data:${mimeType};base64,${buffer.toString("base64")}`,
          contentType: mimeType,
        },
      },
      {
        text: `You are a nutrition expert. Analyze this food image and estimate the macros.${contextNote}\n\n${NUTRITION_INSTRUCTIONS}`,
      },
    ],
    output: { schema: CalEstimateSchema },
  }));

  if (!output) throw new Error("No output from Gemini");
  return output;
}

export async function estimateCaloriesFromText(description: string) {
  const { output } = await withRetry(() => ai.generate({
    model: "googleai/gemini-2.5-flash",
    prompt: `You are a nutrition expert. Estimate the macros for the following meal.\n\nMeal: ${description}\n\n${NUTRITION_INSTRUCTIONS}`,
    output: { schema: CalEstimateSchema },
  }));

  if (!output) throw new Error("No output from Gemini");
  return output;
}
